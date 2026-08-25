-- ============================================================================
-- 0009 — Cash on delivery
--
-- Until now every order went through Stripe, so "has it been paid" and "has the
-- customer committed" were the same question. With cash on delivery they come
-- apart: the customer has ordered, staff must buy and deliver the goods, and
-- the money only arrives at the door.
--
-- Two additions:
--   • payment_method — how this order is meant to be paid
--   • a 'confirmed' status — ordered, not yet paid
-- ============================================================================

alter table public.orders
  add column if not exists payment_method text not null default 'card';

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('card', 'cod'));

comment on column public.orders.payment_method is
  'card = paid online via Stripe; cod = cash collected on delivery.';

/*
  'confirmed' sits between 'pending' and 'paid', and exists because neither
  fitted.

  'pending' means a Stripe checkout was started and abandoned — the customer
  never committed, and the app supersedes those rows when a new basket comes
  along. A cash order is the opposite: fully committed, and it must never be
  swept away.

  'paid' would be a lie until the courier has the money, and would inflate
  revenue on the orders screen.

  So: confirmed = ordered, goods owed, money not yet collected. Stock is
  consumed at this point (the app treats it as a consuming status), because
  staff have to buy the item from the supplier the moment the order lands —
  waiting for payment would mean waiting to order the stock.
*/
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'paid', 'fulfilled', 'cancelled'));

-- Cash orders are worked from the admin queue, so they're looked up by status
-- far more than anything else here.
create index if not exists orders_status_idx on public.orders (status);
