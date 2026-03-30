"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faCompass,
  faFolderTree,
  faNoteSticky,
  faRss,
} from "@fortawesome/free-solid-svg-icons";
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
  const browseRoute = pathname === "/browse" || pathname.startsWith("/browse/");
  const navIcons = {
    Browse: faCompass,
    Notes: faNoteSticky,
    Feed: faRss,
    Guide: faBookOpen,
    Resources: faFolderTree,
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
        <div className="shell-container grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3 sm:justify-self-start">
            <Link
              href="/"
              className="min-w-0 px-1 text-center sm:px-0"
            >
              <span className="block truncate text-[1.08rem] leading-none font-semibold tracking-[-0.03em] sm:text-[1.2rem]">
                Verse Together
              </span>
              <span className="hidden text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-soft)] sm:block">
                Study, note, share
              </span>
            </Link>
            <nav className="hidden min-w-0 sm:flex items-center overflow-x-auto no-scrollbar" aria-label="Primary">
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
                      className="segmented-control-button h-[2.1rem] w-[2.1rem] justify-center gap-2 px-0 text-sm font-medium xl:h-auto xl:w-auto xl:px-4"
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
          </div>

          <div className="hidden min-w-0 sm:flex items-center justify-self-end gap-2">
            <ThemeSelect compact />
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
                <button className="inline-flex min-h-9 items-center rounded-full border border-transparent bg-[color:var(--surface-button-active)] px-4 py-1.5 text-sm font-medium text-[color:var(--surface-button-active-text)] shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:opacity-90">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>
      <button
        className="fixed z-40 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] text-[color:var(--foreground)] shadow-[0_12px_28px_rgba(0,0,0,0.16)] sm:hidden"
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
