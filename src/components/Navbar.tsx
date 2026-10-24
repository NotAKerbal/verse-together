"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faPencil,
  faShoePrints,
  faBars,
  faChevronDown,
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
  const [collapsed, setCollapsed] = useState(false);
  const navItems = primaryNavItems;
  const navIcons = {
    Browse: faBookOpen,
    Notes: faPencil,
    "Come Follow Me": faShoePrints,
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
    <header className="app-header" data-collapsed={collapsed ? "true" : "false"}>
      <div className="desktop-nav-bar">
        <div id="desktop-navigation" className="desktop-nav-content">
          <Link href="/" className="brand-wordmark desktop-nav-brand" aria-label="Verse Together home">
            Verse<span>Together</span>
          </Link>
          <nav className="simple-hide desktop-nav-links" aria-label="Primary">
            {navItems.map((item) => {
              const active = isPathActive(pathname, item.href);
              const href = item.href === "/browse" ? browseHref : item.href;
              const icon = navIcons[item.label];
              return (
                <Link
                  key={item.href}
                  href={href}
                  data-active={active ? "true" : "false"}
                  className="desktop-nav-link"
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                >
                  <FontAwesomeIcon icon={icon} className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="simple-hide desktop-nav-account">
            <AccountControl variant="dock" />
          </div>
        </div>
        <button
          type="button"
          className="simple-hide desktop-nav-toggle"
          aria-controls="desktop-navigation"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <FontAwesomeIcon icon={collapsed ? faBars : faChevronDown} className="h-3.5 w-3.5" aria-hidden="true" />
          {collapsed ? <span>Menu</span> : null}
        </button>
      </div>
    </header>
  );
}
