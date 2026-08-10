"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CartItem } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  hydrated: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// The cart is stored PER IDENTITY so one shopper's bag never bleeds into
// another's on a shared device, and a returning customer gets their own bag
// back. The key suffix is the Supabase user id, or "guest" when signed out.
const STORAGE_PREFIX = "arabicsouk.cart.v1";
const LEGACY_KEY = "arabicsouk.cart.v1"; // the old single, un-scoped bucket
const keyFor = (identity: string) => `${STORAGE_PREFIX}.${identity}`;
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // null until we know who the shopper is (a user id, or "guest").
  const [identity, setIdentity] = useState<string | null>(null);

  const activeKey = useRef<string | null>(null);
  const skipPersist = useRef(false);

  // Resolve the current identity from Supabase auth and follow sign in / out.
  useEffect(() => {
    if (!hasSupabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdentity("guest");
      return;
    }
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity(session?.user?.id ?? "guest");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the bag for the active identity whenever it resolves or changes.
  // Reading localStorage after mount (not during render) avoids an SSR
  // hydration mismatch, so the setState-in-effect here is intentional.
  useEffect(() => {
    if (identity === null) return;
    const key = keyFor(identity);
    let restored: CartItem[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) restored = parsed;
      }
      localStorage.removeItem(LEGACY_KEY); // discard the old un-scoped cart
    } catch {
      /* ignore malformed / unavailable storage */
    }
    activeKey.current = key;
    skipPersist.current = true; // the load below must not rewrite storage
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(restored);
    setHydrated(true);
  }, [identity]);

  // Persist on change — but skip the write that immediately follows a load, so
  // a just-loaded bag is never copied onto a different identity's key.
  useEffect(() => {
    if (!hydrated || !activeKey.current) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(activeKey.current, JSON.stringify(items));
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [items, hydrated]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.productId === item.productId);
      if (existing) {
        return prev.map((p) =>
          p.productId === item.productId ? { ...p, quantity: p.quantity + qty } : p,
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((p) => p.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((p) => p.productId !== productId)
        : prev.map((p) => (p.productId === productId ? { ...p, quantity: qty } : p)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const count = useMemo(() => items.reduce((n, i) => n + i.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count,
      subtotal,
      isOpen,
      hydrated,
      openCart,
      closeCart,
      addItem,
      removeItem,
      updateQuantity,
      clear,
    }),
    [
      items,
      count,
      subtotal,
      isOpen,
      hydrated,
      openCart,
      closeCart,
      addItem,
      removeItem,
      updateQuantity,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
