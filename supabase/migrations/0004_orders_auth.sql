-- ============================================================================
-- Real order placement: link orders to customer accounts + Stripe, and let a
-- signed-in customer read their own orders (writes stay service-role only).
-- Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists stripe_payment_intent text;

create index if not exists orders_user_idx on public.orders (user_id);

-- One order per PaymentIntent (guards against duplicate webhook processing).
create unique index if not exists orders_payment_intent_idx
  on public.orders (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- ---------- Row Level Security ----------
-- A logged-in customer may READ their own orders and the lines within them.
-- Inserts/updates happen through the service role (checkout API + Stripe
-- webhook), which bypasses RLS — so there is no public write policy.

drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );
