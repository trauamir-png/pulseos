"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared open/close state for the mobile sidebar drawer. Sidebar and Topbar
 * are sibling client components (not parent/child), so this context is the
 * minimal way to let Topbar's hamburger button control Sidebar's drawer
 * without lifting state into the (server) DashboardLayout.
 */
const MobileNavContext = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
