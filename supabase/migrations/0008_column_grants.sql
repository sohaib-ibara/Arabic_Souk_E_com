-- ============================================================================
-- 0008 — Actually hide the staff-only product columns
--
-- 0005 and 0007 both tried to hide a column with:
--
--     revoke select (cost_price) on public.products from anon, authenticated;
--
-- That is a no-op, and both migrations shipped believing otherwise.
--
-- In PostgreSQL a table-level `GRANT SELECT ON products` covers every column,
-- including ones added later. A column-level REVOKE does not carve an exception
-- out of it — it only removes a column-level grant, and there wasn't one. The
-- table-level grant Supabase issues to anon/authenticated stayed in force, so
-- cost_price has been publicly readable since 0005, and source_url from the
-- moment 0007 ran. Verified against the live database with the anon key.
--
-- The fix is the other way round: drop the blanket table grant, then grant back
-- exactly the columns the storefront reads. A column added in future is then
-- private by default and has to be granted deliberately, which is the safer
-- direction to fail in.
-- ============================================================================

revoke select on public.products from anon, authenticated;

/*
  Exactly the list in PUBLIC_PRODUCT_COLUMNS (src/lib/data.ts). These two must
  stay in step: a column the storefront selects but isn't granted here takes the
  whole catalogue down, and a column granted here but not needed is a quiet
  leak. Both roles are listed because a signed-in shopper browses as
  `authenticated`, not `anon`.

  Deliberately NOT granted — staff-only, service role reaches them anyway:
    cost_price           reveals margin on every line
    source_url           reveals the supplier and the full sourcing list
    sku, barcode         internal identifiers
    low_stock_threshold  operational setting
*/
grant select (
  id,
  name,
  slug,
  description,
  short_description,
  price,
  compare_at_price,
  currency,
  images,
  category_id,
  brand_id,
  rating,
  review_count,
  stock_quantity,
  in_stock,
  is_featured,
  is_new,
  tags,
  created_at,
  updated_at
) on public.products to anon, authenticated;

-- The revokes from 0005/0007 are now redundant but harmless; left in place so
-- the intent of those migrations still reads correctly in history.
