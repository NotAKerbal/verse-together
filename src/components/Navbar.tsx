"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faPencil,
  faShoePrints,
  faChevronLeft,
} from "@fortawesome/free-solid-svg-icons";
import AccountControl from "@/components/AccountControl";
import { AppHeaderSlot, useAppHeaderSlot } from "@/components/AppHeaderSlot";
import LibrarySearch from "@/components/LibrarySearch";
import { useAuth } from "@/lib/auth";
import { upsertCurrentUser } from "@/lib/appData";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

export default function Navbar() {
  const { user, getToken } = useAuth();
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();
  const [collapsed, setCollapsed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const navItems = primaryNavItems;
  const activeIndex = navItems.findIndex((item) => isPathActive(pathname, item.href));
  // The Library's search, and any page's header controls (AppHeaderPortal), sit at the header's right,
  // outside the collapsible (clipped, inert) nav.
  const showLibrarySearch = pathname === "/browse";
  const { filled: headerSlotFilled } = useAppHeaderSlot();
  const navIcons = {
    Browse: faBookOpen,
    Notes: faPencil,
    "Come Follow Me": faShoePrints,
  } as const;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // Measure the unclipped text so the label and shared highlight can animate to the same width.
    const labels = Array.from(nav.querySelectorAll<HTMLElement>(".desktop-nav-label-text"));
    const measureLabels = () => {
      labels.forEach((label, index) => {
        const width = `${label.getBoundingClientRect().width}px`;
        label.closest("a")?.style.setProperty("--nav-label-width", width);
        if (index === activeIndex) nav.style.setProperty("--active-label-width", width);
      });
      nav.dataset.measured = "true";
    };
    measureLabels();
    const observer = new ResizeObserver(measureLabels);
    labels.forEach((label) => observer.observe(label));
    return () => observer.disconnect();
  }, [activeIndex]);

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
    <header
      className="app-header"
      data-collapsed={collapsed ? "true" : "false"}
      data-actions={showLibrarySearch || headerSlotFilled ? "true" : undefined}
    >
      <div className="desktop-nav-bar">
        <Link href="/" className="brand-wordmark desktop-nav-brand" aria-label="Verse Together home">
          Verse<span>Together</span>
        </Link>
        <div id="desktop-navigation" className="desktop-nav-content" inert={collapsed} aria-hidden={collapsed}>
          <div className="desktop-nav-items">
            <nav
              ref={navRef}
              className="simple-hide desktop-nav-links"
              aria-label="Primary"
              data-has-active={activeIndex >= 0 ? "true" : "false"}
              style={{ "--active-index": Math.max(0, activeIndex) } as CSSProperties}
            >
              <span className="desktop-nav-indicator" aria-hidden="true" />
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
                    <span className="desktop-nav-label" aria-hidden="true">
                      <span className="desktop-nav-label-text">{item.label}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="simple-hide desktop-nav-account">
              <AccountControl variant="dock" />
            </div>
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
          <FontAwesomeIcon icon={faChevronLeft} className="desktop-nav-toggle-icon h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {showLibrarySearch ? <LibrarySearch variant="header" className="simple-hide app-header-search" /> : null}
      <AppHeaderSlot className="simple-hide app-header-slot" />
    </header>
  );
}
