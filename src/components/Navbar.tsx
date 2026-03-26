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
  faRectangleList,
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
  const navIcons = {
    Browse: faCompass,
    Notes: faNoteSticky,
    Plans: faRectangleList,
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
      <header className="app-header w-full">
        <div className="mx-auto grid w-full grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:justify-self-start">
            <button
              className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--foreground)] sm:hidden"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </button>
            <Link
              href="/"
              className="px-2 text-center text-[1.1rem] leading-none font-semibold tracking-[0.01em] sm:px-0 sm:text-lg"
            >
              Verse Together
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
