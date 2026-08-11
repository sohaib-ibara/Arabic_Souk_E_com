-- ============================================================================
-- Inventory management
--
-- Adds stock identity (SKU / barcode / cost), a per-product fulfilment mode,
-- and an append-only movement ledger so every change to stock is attributable.
--
-- Fulfilment mode is the important part. The store currently sells
-- supplier-direct, so quantity must NOT gate checkout — every imported product
-- has stock_quantity = 0 and enforcing it would refuse every order. Products
-- default to 'dropship': movements are still recorded (a sales log), but the
-- on-hand figure is left alone. Flip a product to 'stocked' and the same code
-- path starts decrementing and blocking. No rebuild needed.
--
-- Run this in the Supabase SQL editor, or `supabase db push` with the CLI.
-- ============================================================================

-- ---------- Product stock identity ----------
alter table public.products
  add column if not exists sku                 text,
  add column if not exists barcode             text,
  add column if not exists cost_price          numeric(10,3) check (cost_price >= 0),
  add column if not exists tracking_mode       text not null default 'dropship',
  add column if not exists low_stock_threshold integer not null default 5;

-- Added separately so re-running the migration doesn't fail on an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_tracking_mode_check'
  ) then
    alter table public.products
      add constraint products_tracking_mode_check
      check (tracking_mode in ('dropship', 'stocked'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_low_stock_threshold_check'
  ) then
    alter table public.products
      add constraint products_low_stock_threshold_check
      check (low_stock_threshold >= 0);
  end if;
end $$;

-- SKUs are optional, but must be unique when present.
create unique index if not exists products_sku_idx
  on public.products (sku) where sku is not null;

create index if not exists products_tracking_mode_idx on public.products (tracking_mode);

-- ---------- Movement ledger ----------
-- Append-only. Never updated or deleted: the history is the audit trail.
create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  delta          integer not null,          -- signed: -2 sold, +10 received
  balance_after  integer,                   -- on-hand after this movement; null when the
                                            -- product is dropship (nothing to balance)
  reason         text not null check (reason in
                   ('sale', 'restock', 'adjustment', 'receipt', 'count', 'initial')),
  note           text,
  reference_type text,                      -- 'order' | 'stock_take' | null
  reference_id   uuid,
  actor          text,                      -- admin email, or 'system' for automatic moves
  created_at     timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_reference_idx
  on public.stock_movements (reference_type, reference_id);
create index if not exists stock_movements_created_idx
  on public.stock_movements (created_at desc);

-- ---------- Atomic movement application ----------
/*
  Applies a movement and (optionally) moves the on-hand figure in one statement,
  so two concurrent orders can't both read the same balance and write back a
  lost update.

  p_affects_stock lets the caller separate intent from bookkeeping:
    - manual adjustments / receipts / counts pass true — an admin explicitly
      said the number changed, regardless of fulfilment mode
    - automatic sale + restock pass true only for 'stocked' products, so
      dropship lines get a ledger entry without their on-hand going negative

  Returns the resulting balance, or null when stock wasn't touched.
*/
create or replace function public.apply_stock_movement(
  p_product_id     uuid,
  p_delta          integer,
  p_reason         text,
  p_affects_stock  boolean default true,
  p_note           text default null,
  p_reference_type text default null,
  p_reference_id   uuid default null,
  p_actor          text default 'system'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_affects_stock then
    update public.products
       set stock_quantity = stock_quantity + p_delta
     where id = p_product_id
     returning stock_quantity into v_balance;

    if not found then
      raise exception 'Product % not found', p_product_id;
    end if;

    -- products.stock_quantity carries a >= 0 check; surface it in plain language.
    if v_balance < 0 then
      raise exception 'Insufficient stock for product %: on hand would become %',
        p_product_id, v_balance;
    end if;
  else
    v_balance := null;
  end if;

  insert into public.stock_movements
    (product_id, delta, balance_after, reason, note, reference_type, reference_id, actor)
  values
    (p_product_id, p_delta, v_balance, p_reason, p_note, p_reference_type, p_reference_id,
     coalesce(p_actor, 'system'));

  return v_balance;
end;
$$;

-- ---------- Reservations ----------
/*
  Units committed to orders that are placed but not yet paid.

  Derived from pending orders rather than kept as a counter column: a counter
  drifts whenever a checkout is abandoned, and there's no reliable moment to
  decrement it. The 30-minute window means an abandoned basket releases its
  hold on its own, with no cleanup job.
*/
create or replace view public.product_reservations
  with (security_invoker = on) as
  select oi.product_id,
         sum(oi.quantity)::integer as reserved
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status = 'pending'
     and o.created_at > now() - interval '30 minutes'
     and oi.product_id is not null
   group by oi.product_id;

-- ---------- Inventory overview ----------
-- One row per product with everything the admin screens need, so the common
-- case is a single select instead of a join assembled in application code.
create or replace view public.inventory_overview
  with (security_invoker = on) as
  select p.id,
         p.name,
         p.slug,
         p.sku,
         p.barcode,
         p.price,
         p.cost_price,
         p.currency,
         p.tracking_mode,
         p.stock_quantity,
         p.low_stock_threshold,
         p.in_stock,
         coalesce(r.reserved, 0)                        as reserved,
         p.stock_quantity - coalesce(r.reserved, 0)     as available,
         (p.stock_quantity * coalesce(p.cost_price, 0)) as stock_value,
         -- Precomputed because PostgREST can't filter one column against
         -- another, and "low stock" is the list the admin lives in.
         (p.tracking_mode = 'stocked' and p.stock_quantity <= 0)
           as is_out,
         (p.tracking_mode = 'stocked' and p.stock_quantity > 0
            and p.stock_quantity <= p.low_stock_threshold)
           as is_low,
         c.name                                         as category_name,
         b.name                                         as brand_name,
         p.updated_at
    from public.products p
    left join public.product_reservations r on r.product_id = p.id
    left join public.categories c on c.id = p.category_id
    left join public.brands b     on b.id = p.brand_id;

-- ---------- Row Level Security ----------
-- Movements are staff-only: RLS on with no policy means the anon key sees
-- nothing, and the service role (which bypasses RLS) is the only way in.
alter table public.stock_movements enable row level security;

/*
  Cost price must not be public.

  `products` carries a "public read" policy for select using (true), which is
  per-row, not per-column — so a new column on that table is readable by anyone
  holding the anon key. Cost price is commercially sensitive (it reveals margin
  on every line), so it's revoked at the column level, which RLS can't express.

  The storefront selects an explicit column list rather than `*`, so this
  revoke doesn't break it. Adding a sensitive column later means updating that
  list too — `select *` against this table would start failing for anon, which
  is the intended safety net.
*/
revoke select (cost_price) on public.products from anon, authenticated;

-- The two views above are security_invoker, so they run with the caller's
-- privileges: the service role sees everything, while the anon key gets RLS
-- applied to orders/order_items and is refused cost_price. Without that they
-- would run as the view owner and quietly bypass both.
