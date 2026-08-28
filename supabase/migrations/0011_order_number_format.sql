-- ============================================================================
-- 0011 — A readable order number
--
-- Orders currently read `LM-1594D0E6`: a two-letter prefix left over from a
-- previous brand name, plus eight characters of a random UUID. The client's
-- note was "looks odd", and they are right — it reads like an error code, it
-- carries no information, and eight hex characters are painful to relay over
-- the phone or copy into the tracking form.
--
-- The new shape is `AS-260828-1042`:
--
--   AS       the store's initials
--   260828   the date it was placed (YYMMDD) — staff can date an order on sight
--   1042     a counter, from a sequence, so it can never collide
--
-- The sequence starts at 1000 so the first order is not visibly the first.
--
-- ⚠️  EXISTING ORDERS ARE NOT RENUMBERED. The twenty `LM-` orders keep their
-- numbers: customers hold them in confirmation emails, and /track looks orders
-- up by exactly that string. Renumbering would break both. Only new orders get
-- the new format, so the two coexist — which is correct, an order number is a
-- historical fact, not a display preference.
-- ============================================================================

begin;

-- Owned by nothing, so it survives the column default being changed again.
create sequence if not exists public.order_number_seq start with 1000;

/*
  A function rather than an inline default expression, so the format lives in
  one named place that can be read and changed without an ALTER on the table.

  VOLATILE, and it matters. The function advances a sequence and reads the
  clock, so it is a different value on every call. Marking it STABLE or
  IMMUTABLE would license Postgres to evaluate it once and reuse the result,
  which would hand every order inserted in one statement the same number — and
  the unique constraint would then reject all but the first.
*/
create or replace function public.generate_order_number()
returns text
language sql
volatile
as $$
  select 'AS-'
      || to_char((now() at time zone 'Asia/Bahrain'), 'YYMMDD')
      || '-'
      || nextval('public.order_number_seq')::text;
$$;

comment on function public.generate_order_number() is
  'Order numbers as AS-YYMMDD-NNNN. Bahrain time, so the date matches the shop day.';

alter table public.orders
  alter column order_number set default public.generate_order_number();

commit;

-- Sanity check (optional) — shows the next number without consuming an order:
--   select public.generate_order_number();
--
-- Existing orders are untouched; expect both prefixes for a while:
--   select split_part(order_number, '-', 1) as prefix, count(*)
--     from public.orders group by 1;
