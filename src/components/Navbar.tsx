"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import MobileNavDrawer from "@/components/MobileNavDrawer";
import { useAuth } from "@/lib/auth";
import { upsertCurrentUser } from "@/lib/appData";

const navItems = [
  { href: "/browse", label: "Browse" },
  { href: "/feed", label: "Notes" },
  { href: "/help", label: "Guide" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function syncCurrentUser() {
      if (!user?.id) return;
      try {
        const token = await getToken({ template: "convex" });
        await upsertCurrentUser(token, {
          email: user.email,
          displayName: user.fullName,
          avatarUrl: user.imageUrl,
        });
      } catch {
        // non-blocking
      }
    }
    void syncCurrentUser();
  }, [user?.id, user?.email, user?.fullName, user?.imageUrl, getToken]);

  return (
    <>
      <header className="w-full border-b border-black/10 dark:border-white/15 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              className="sm:hidden inline-flex items-center justify-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              Menu
            </button>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Verse Together
            </Link>
            <nav className="hidden sm:flex items-center gap-2">
              {navItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors ${
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
          </div>

          <div className="hidden sm:flex items-center gap-2">
            {user ? (
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-9 w-9",
                  },
                }}
                afterSignOutUrl="/"
              />
            ) : (
              <SignInButton mode="modal">
                <button className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-90">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
