"use client";

import { useFaithTradition } from "@/lib/useFaithTradition";
import { isLdsContentPath } from "@/lib/faithTradition";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import AccountControl from "@/components/AccountControl";
import { AppHeaderSlot, useAppHeaderSlot } from "@/components/AppHeaderSlot";
import LibrarySearch from "@/components/LibrarySearch";
import ReaderHeaderSlot from "@/components/ReaderHeaderSlot";
import { primaryNavIcons } from "@/components/primaryNavIcons";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { useSimpleMode } from "@/lib/simpleMode";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

export default function Navbar() {
  const { showLdsContent } = useFaithTradition();
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const navRef = useRef<HTMLElement>(null);
  const navItems = primaryNavItems.filter((item) => showLdsContent || !isLdsContentPath(item.href));
  const activeIndex = navItems.findIndex((item) => isPathActive(pathname, item.href));
  // The Library's search, and any page's header controls (AppHeaderPortal), sit at the header's right,
  // outside the collapsible (clipped, inert) nav.
  const showLibrarySearch = pathname === "/browse";
  const { filled: headerSlotFilled } = useAppHeaderSlot();

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll<HTMLElement>(".desktop-nav-link"));
    const measureActiveLink = () => {
      const activeLink = links[activeIndex];
      if (activeLink) {
        nav.style.setProperty("--active-link-offset", `${activeLink.offsetLeft}px`);
        nav.style.setProperty("--active-link-width", `${activeLink.offsetWidth}px`);
      }
      nav.dataset.measured = "true";
    };
    measureActiveLink();
    const observer = new ResizeObserver(measureActiveLink);
    links.forEach((link) => observer.observe(link));
    return () => observer.disconnect();
  }, [activeIndex, navItems.length]);

  // Phones have no app header (outside simple mode): the bottom navigation carries the destinations,
  // and Notes and Plans show the account at their own top right (AccountControl variant="page").
  return (
    <header
      className="app-header"
      data-actions={showLibrarySearch || headerSlotFilled ? "true" : undefined}
    >
      <div className="desktop-nav-bar">
        <Link href="/" className="brand-wordmark desktop-nav-brand" aria-label="Verse Together home">
          Verse<span>Together</span>
        </Link>
        <div id="desktop-navigation" className="desktop-nav-content" inert={simpleMode} aria-hidden={simpleMode}>
          <div className="desktop-nav-items">
            <nav
              ref={navRef}
              className="desktop-nav-links"
              aria-label="Primary"
              data-has-active={activeIndex >= 0 ? "true" : "false"}
            >
              <span className="desktop-nav-indicator" aria-hidden="true" />
              {navItems.map((item) => {
                const active = isPathActive(pathname, item.href);
                const href = item.href === "/browse" ? browseHref : item.href;
                const icon = primaryNavIcons[item.label];
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
                    <span className="desktop-nav-label" aria-hidden="true">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="desktop-nav-account">
              <AccountControl variant="dock" />
            </div>
          </div>
        </div>
        <button
          type="button"
          className="desktop-nav-toggle"
          aria-controls="desktop-navigation"
          aria-pressed={simpleMode}
          aria-label={simpleMode ? "Turn simple mode off" : "Turn simple mode on"}
          title={simpleMode ? "Turn simple mode off" : "Turn simple mode on"}
          onClick={() => setSimpleMode(!simpleMode)}
        >
          <FontAwesomeIcon icon={faChevronLeft} className="desktop-nav-toggle-icon h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {showLibrarySearch ? <LibrarySearch variant="header" className="simple-hide app-header-search" /> : null}
      {/* Browse pages' controls (AppHeaderPortal), e.g. a volume's or book's navigation. */}
      <AppHeaderSlot className="simple-hide app-header-slot" />
      {/* A chapter's header (search, trail, Log, settings) sits here on wide screens; see ChapterHeader. */}
      <ReaderHeaderSlot />
    </header>
  );
}
