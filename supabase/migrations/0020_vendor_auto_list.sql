-- Per-vendor: does a newly imported product go straight onto the shop?
--
-- Until now the answer was always no. `importStagedForVendor` writes
-- `is_published = false` for anything genuinely new, on the reasoning that a
-- human should look at a product before a shopper can buy it. That reasoning
-- produced a shop showing 330 of 547 products: 214 Cult Beauty products had
-- been imported and nobody had ever listed them, and the client's own report
-- was "website doesn't show all the products available from both vendors".
--
-- So it becomes a setting rather than a rule, because both answers are
-- legitimate and they belong to whoever is running the shop:
--
--   off  every new product arrives hidden and somebody lists it. Right when a
--        supplier's catalogue needs picking over.
--   on   every new product goes on the shop as it is imported. Right when the
--        agreement is "we carry everything they have", which is this client's.
--
-- Default false, so nothing changes for an existing vendor until somebody
-- turns it on. It has no effect on a product already in the catalogue — this
-- decides what a product is born as, and every product keeps its own switch
-- afterwards.
--
-- The three other gates are unaffected. A vendor that is switched off, a
-- category switched off shop-wide, or a vendor-category rule will still keep
-- an auto-listed product off the shop; see compute_is_listed in 0015.

alter table public.vendors
  add column if not exists auto_list boolean not null default false;

comment on column public.vendors.auto_list is
  'When true, products imported from this vendor are listed on the storefront immediately instead of arriving hidden.';
