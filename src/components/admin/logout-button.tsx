"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminButton } from "@/components/admin/button-styles";

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
      className={adminButton("secondary")}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
