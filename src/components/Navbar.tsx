"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import MobileNavDrawer from "@/components/MobileNavDrawer";
import ThemeSelect from "@/components/ThemeSelect";
import { useAdminStatus, useAuth } from "@/lib/auth";
import { upsertCurrentUser } from "@/lib/appData";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export default function Navbar() {
  const { user, getToken } = useAuth();
  const { isAdmin } = useAdminStatus();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const browseHref = useBrowseNavHref();
  const navItems = isAdmin
    ? [...primaryNavItems, { href: "/resources/manage", label: "Resources" }]
    : primaryNavItems;

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
      <header className="app-header w-full">
        <div className="mx-auto grid max-w-6xl grid-cols-[32px_1fr_32px] items-center gap-2 px-4 py-1.5 sm:flex sm:justify-between sm:gap-3 sm:py-3">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--foreground)] sm:hidden"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </button>
            <nav className="hidden sm:flex items-center gap-2">
              {navItems.map((item) => {
                const active = isPathActive(pathname, item.href);
                const href = item.href === "/browse" ? browseHref : item.href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-[color:var(--surface-button-active)] bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]"
                        : "border-[color:var(--surface-border)] bg-[color:var(--surface-button)] hover:bg-[color:var(--surface-button-hover)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex justify-center sm:block">
            <Link
              href="/"
              className="text-center text-[1.1rem] font-semibold tracking-[0.01em] leading-none sm:text-left sm:text-lg"
            >
              Verse Together
            </Link>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <ThemeSelect />
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
                <button className="inline-flex items-center rounded-full bg-[color:var(--surface-button-active)] px-3 py-1.5 text-sm font-medium text-[color:var(--surface-button-active-text)] hover:opacity-90">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>

          <div className="h-8 w-8 sm:hidden" aria-hidden="true" />
        </div>
      </header>
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
