-- ============================================================================
-- 0018 — Prices to two decimals
--
-- The dinar is a 3-decimal currency and the shop priced to three on that
-- basis. The client asked for two, more than once, and they are right for a
-- reason worth recording: Stripe refuses a 3-decimal amount whose last digit
-- is not zero, so the checkout already rounds BHD to two before charging.
-- The shop was showing BHD 1.157 and taking BHD 1.160.
--
-- So this is not cosmetic. Displaying two while storing three would leave a
-- basket whose lines do not add up to its total, which is worse than either.
-- Both move together: `vendor_retail_price` stops producing a third decimal,
-- and scripts/round-prices.mjs rounds what is already stored.
--
-- The columns stay numeric(10,3). Nothing needs a third decimal any more, but
-- narrowing them would rewrite three tables to buy nothing, and would make
-- going back a migration rather than a one-line change.
-- ============================================================================

-- HOW TO RUN: paste this whole file into the Supabase SQL editor and Run,
-- then `node --env-file=.env.local scripts/round-prices.mjs --apply`.
-- Requires 0014.

begin;

do $$
begin
  if to_regclass('public.vendors') is null then
    raise exception 'Migration 0018 requires 0014_vendor_provisioning.sql. Run that first.';
  end if;
end $$;

/*
  Unchanged except for the scale: round(..., 2) rather than round(..., 3).

  `attractive_price` needed no change — its ladder was always .19/.29/.49/.69/
  .89/.99, two decimals by construction. It was the un-rounded branch, the one
  a vendor with `round_prices = false` takes, that produced the third decimal:
  noon's SAR × 0.1 turns 11.57 into 1.157.
*/
create or replace function public.vendor_retail_price(
  p_amount    numeric,
  p_fx        numeric,
  p_markup    numeric,
  p_surcharge numeric,
  p_round     boolean
) returns numeric
language sql
immutable
as $$
  select case
    when p_amount is null then null
    when p_amount <= 0    then 0::numeric
    when p_round          then public.attractive_price(
                                round(p_amount * p_fx * (1 + p_markup / 100.0) + p_surcharge, 2))
    else                       round(p_amount * p_fx * (1 + p_markup / 100.0) + p_surcharge, 2)
  end;
$$;

commit;

-- Sanity checks (optional):
--   select public.vendor_retail_price(11.57, 0.1, 0, 0, false);  -- 1.16
--   select public.vendor_retail_price(17.50, 0.509, 0, 0, true); -- 8.89
--   -- anything still carrying a third decimal:
--   select count(*) from public.products where price <> round(price, 2);
