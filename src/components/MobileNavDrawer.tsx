"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import ThemeSelect from "@/components/ThemeSelect";

type Props = {
  open: boolean;
  onClose: () => void;
};

const navItems = [
  { href: "/browse", label: "Browse" },
  { href: "/feed", label: "Notes" },
  { href: "/help", label: "Guide" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileNavDrawer({ open, onClose }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
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
      requestAnimationFrame(() => requestAnimationFrame(() => setHasEntered(true)));
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    setHasEntered(false);
  }, [open]);

  if (!open && !isClosing) return null;

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
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={requestClose}
                className={`px-3 py-2 rounded-md border text-sm ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="pt-1 border-t border-black/10 dark:border-white/15">
          <ThemeSelect compact />
        </div>

        <div className="pt-1 border-t border-black/10 dark:border-white/15">
          {user ? (
            <div className="py-2">
              <UserButton afterSignOutUrl="/" />
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="px-3 py-2 rounded-md bg-foreground text-background text-sm">Sign in</button>
            </SignInButton>
          )}
        </div>
      </div>
    </div>
  );
}
