"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompass,
  faLightbulb,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import AccountControl from "@/components/AccountControl";
import { useAuth } from "@/lib/auth";
import { upsertCurrentUser } from "@/lib/appData";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

export default function Navbar() {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
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

  // Phones have no app header (outside simple mode): the bottom navigation carries the destinations,
  // and Notes and Plans show the account at their own top right (AccountControl variant="page").
  return (
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
          <AccountControl variant="header" />
        </div>
      </div>
    </header>
  );
}
