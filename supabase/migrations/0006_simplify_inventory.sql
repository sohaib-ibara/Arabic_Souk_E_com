-- ============================================================================
-- Simplify inventory: one kind of product
--
-- 0005 split products into 'dropship' and 'stocked' so quantity could gate
-- checkout for some lines and not others. That distinction isn't real here —
-- every product is ours to sell, and the admin decides availability by hand
-- when something can't be sourced. So:
--
--   * tracking_mode is removed. There is one kind of product.
--   * `in_stock` is the availability switch, and the only thing that blocks
--     checkout. Quantity is tracked and reported, never enforced.
--   * Reservations are dropped. Holding units against unpaid orders only
--     matters when quantity gates a sale, and it no longer does.
--   * On-hand may go negative. Selling something you don't have on the shelf
--     is normal when you source per order, and "-3" is a clearer statement of
--     what to buy than a number clamped at zero.
--
-- Run after 0005, in the Supabase SQL editor.
-- ============================================================================

-- Views first — they depend on the column and constraint below.
drop view if exists public.inventory_overview;
drop view if exists public.product_reservations;

-- ---------- Drop the fulfilment split ----------
drop index if exists public.products_tracking_mode_idx;

alter table public.products
  drop constraint if exists products_tracking_mode_check;

alter table public.products
  drop column if exists tracking_mode;

-- ---------- Allow oversold ----------
-- On-hand below zero means "sold more than we had" — the shortfall is the
-- buying list. Clamping it at zero would throw that information away.
alter table public.products
  drop constraint if exists products_stock_quantity_check;

-- ---------- Movement application ----------
-- Same contract as 0005 minus the fulfilment branch: every movement now moves
-- the on-hand figure, and a negative result is a valid outcome rather than an
-- error. p_affects_stock is kept so existing calls still type-check, but the
-- only caller passes true.
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

-- ---------- Inventory overview ----------
/*
  One row per product for the admin screens.

  Three plain flags instead of the old mode-dependent ones:
    is_unavailable — admin has switched it off; customers can't order it
    is_oversold    — sold below zero, so this many need buying
    is_low         — on hand is at or under the threshold, but still positive
*/
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
         p.stock_quantity,
         p.low_stock_threshold,
         p.in_stock,
         -- Value can't go negative just because on-hand did.
         (greatest(p.stock_quantity, 0) * coalesce(p.cost_price, 0)) as stock_value,
         (not p.in_stock)                                            as is_unavailable,
         (p.stock_quantity < 0)                                      as is_oversold,
         (p.stock_quantity >= 0 and p.stock_quantity <= p.low_stock_threshold)
                                                                     as is_low,
         c.name  as category_name,
         b.name  as brand_name,
         p.updated_at
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.brands b     on b.id = p.brand_id;
