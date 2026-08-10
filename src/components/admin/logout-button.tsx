"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      // Back to the console root, which renders the admin sign-in once the
      // cookie is gone. `replace` keeps the signed-in screen out of history.
      router.replace("/admin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
