"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isBrowseDiscoveryPath, isPathActive, isReaderPath } from "@/lib/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { active: boolean }) => ReactNode;
  active: (pathname: string) => boolean;
};

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 transition-transform duration-200 ${active ? "scale-105" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 4.75A2.75 2.75 0 0 1 8.25 2h9.25v16.25H8.25A2.75 2.75 0 0 0 5.5 21V4.75Z" />
      <path d="M5.5 19.25A2.75 2.75 0 0 1 8.25 16.5H17.5V21H8.25A2.75 2.75 0 0 1 5.5 18.25v1Z" />
      <path d="M9 6.5h5.5" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 transition-transform duration-200 ${active ? "scale-105" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  );
}

function NotesIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 transition-transform duration-200 ${active ? "scale-105" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15h4.5" />
    </svg>
  );
}

const navItems: NavItem[] = [
  {
    href: "/browse",
    label: "Browse",
    icon: BookIcon,
    active: (pathname) => pathname === "/" || isBrowseDiscoveryPath(pathname) || isReaderPath(pathname),
  },
  {
    href: "/search",
    label: "Search",
    icon: SearchIcon,
    active: (pathname) => isPathActive(pathname, "/search"),
  },
  {
    href: "/feed",
    label: "Notes",
    icon: NotesIcon,
    active: (pathname) => isPathActive(pathname, "/feed"),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();

  return (
    <nav
      className="fixed inset-x-0 z-40 flex justify-center px-3 sm:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary mobile navigation"
    >
      <div
        className="pointer-events-auto grid w-full max-w-sm grid-cols-3 items-center gap-2 rounded-[1.8rem] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-[20px]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--mobile-nav-shell) 96%, white 4%), var(--mobile-nav-shell))",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.28), inset 0 1px 0 color-mix(in oklab, white 8%, transparent)",
        }}
      >
        {navItems.map((item) => {
          const active = item.active(pathname);
          const Icon = item.icon;
          const href = item.href === "/browse" ? browseHref : item.href;
          return (
            <Link
              key={item.label}
              href={href}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.35rem] px-1.5 transition-all duration-200"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              data-tap
              style={
                active
                  ? {
                      background: "var(--mobile-nav-active)",
                      color: "var(--mobile-nav-active-text)",
                      boxShadow:
                        "0 10px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.16)",
                    }
                  : {
                      color: "var(--mobile-nav-icon)",
                    }
              }
            >
              <span className="inline-flex items-center justify-center">
                <Icon active={active} />
              </span>
              <span className="text-[0.76rem] font-medium tracking-[0.01em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
