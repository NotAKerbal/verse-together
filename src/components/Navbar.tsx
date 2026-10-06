"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompass,
  faLightbulb,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import MobileNavDrawer from "@/components/MobileNavDrawer";
import { useAuth } from "@/lib/auth";
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
      strokeWidth="2.4"
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
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const browseHref = useBrowseNavHref();
  const navItems = primaryNavItems;
  const browseRoute = pathname === "/browse" || pathname.startsWith("/browse/");
  const navIcons = {
    Browse: faCompass,
    Notes: faLightbulb,
    Plans: faListCheck,
  } as const;

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
      <header className={`app-header hidden w-full sm:block ${browseRoute ? "app-header-scroll" : ""}`}>
        <div className="shell-container grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 py-4">
          <Link href="/" className="brand-wordmark brand-pill min-w-0 text-[1.35rem] sm:text-[1.5rem]">
            Verse<span>Together</span>
          </Link>
          <nav className="simple-hide hidden min-w-0 sm:flex items-center justify-center overflow-x-auto no-scrollbar" aria-label="Primary">
            <div className="segmented-control">
              {navItems.map((item) => {
                const active = isPathActive(pathname, item.href);
                const href = item.href === "/browse" ? browseHref : item.href;
                const icon = navIcons[item.label as keyof typeof navIcons];
                return (
                  <Link
                    key={item.href}
                    href={href}
                    data-active={active ? "true" : "false"}
                    className="segmented-control-button h-[2.25rem] w-[2.25rem] justify-center gap-2 px-0 text-sm xl:h-auto xl:w-auto xl:px-4"
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <FontAwesomeIcon icon={icon} className="h-[0.95rem] w-[0.95rem]" />
                    <span className="hidden xl:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="simple-hide hidden min-w-0 sm:flex items-center justify-self-end gap-3">
            {user ? (
              <span className="inline-flex rounded-full border-2 border-[color:var(--surface-border)] p-0.5">
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox: "h-8 w-8",
                    },
                  }}
                  afterSignOutUrl="/"
                />
              </span>
            ) : (
              <SignInButton mode="modal">
                <button className="inline-flex min-h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 py-1.5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] hover:opacity-90">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>
      <button
        className="simple-hide fixed z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] text-[color:var(--foreground)] shadow-[var(--surface-shadow-soft)] sm:hidden"
        aria-label="Open menu"
        onClick={() => setDrawerOpen(true)}
        style={{ left: "var(--mobile-floating-button-left)", top: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        <MenuIcon />
      </button>
      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
