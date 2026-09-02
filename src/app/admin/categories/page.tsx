import { redirect } from "next/navigation";

/**
 * Categories moved onto the Vendors page.
 *
 * There were two screens about categories - one for "whose products fill this
 * category", one for "does the shop have this category at all" - and watching
 * a demo of it, the client's reaction was that it should be one place. It is:
 * the per-vendor choice is on each vendor's card, and the shop-wide switch is
 * the "Sections of the shop" panel underneath.
 *
 * A redirect rather than a deletion, because this URL is in browser history and
 * possibly in a bookmark, and a 404 tells whoever follows it nothing.
 */
export default function AdminCategoriesRedirect() {
  redirect("/admin/vendors");
}
