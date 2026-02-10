"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SignInButton } from "@clerk/nextjs";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function MobileNavDrawer({ open, onClose }: Props) {
  const { user, signOut } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setIsClosing(false);
      setHasEntered(false);
      // Ensure the element renders off-screen first, then animate in (double rAF)
      requestAnimationFrame(() => requestAnimationFrame(() => setHasEntered(true)));
      // Lock background scroll
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    } else {
      setHasEntered(false);
    }
  }, [open]);

  if (!open && !isClosing) return null;

  async function handleSignOut() {
    await signOut();
    requestClose();
  }

  function requestClose() {
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  }

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        aria-label="Close menu"
        onClick={requestClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 will-change-[opacity] ${open && !isClosing && hasEntered ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-background shadow-2xl border-r border-black/10 dark:border-white/15 p-4 space-y-4 transform transition-transform duration-200 ease-out will-change-[transform] ${open && !isClosing && hasEntered ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Menu</span>
          <button onClick={requestClose} className="px-2 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
        </div>
        <nav className="grid gap-2">
          <Link href="/browse" onClick={requestClose} className="px-3 py-2 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">Browse</Link>
          <Link href="/feed" onClick={requestClose} className="px-3 py-2 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">Feed</Link>
          {user ? (
            <>
              <Link href="/insights/saved" onClick={requestClose} className="px-3 py-2 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">My Insights</Link>
              <Link href="/account" onClick={requestClose} className="px-3 py-2 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">Account</Link>
              <button onClick={handleSignOut} className="px-3 py-2 rounded-md bg-foreground text-background">Sign out</button>
            </>
          ) : (
            <div className="pt-1">
              <SignInButton mode="modal">
                <button className="px-3 py-2 rounded-md bg-foreground text-background">Sign in</button>
              </SignInButton>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}


