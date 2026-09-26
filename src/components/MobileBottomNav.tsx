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

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" {...iconProps} className={`h-5 w-5 ${active ? "scale-105" : ""}`}>
      <path d="M4 5h7v14H4z" />
      <path d="M13 5h7v14h-7z" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" {...iconProps} className={`h-5 w-5 ${active ? "scale-105" : ""}`}>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  );
}

function LightbulbIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" {...iconProps} className={`h-5 w-5 ${active ? "scale-105" : ""}`}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

const navItems: NavItem[] = [
  {
    href: "/browse",
    label: "Read",
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
    href: "/notes",
    label: "Notes",
    icon: LightbulbIcon,
    active: (pathname) => isPathActive(pathname, "/notes"),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();

  return (
    <nav
      className="fixed inset-x-0 z-40 flex justify-center px-4 sm:hidden"
      style={{ bottom: "max(0.85rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary mobile navigation"
    >
      <div
        className="pointer-events-auto grid w-full max-w-sm grid-cols-3 items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] p-1.5 shadow-[var(--surface-shadow-soft)]"
        style={{ background: "var(--mobile-nav-shell)" }}
      >
        {navItems.map((item) => {
          const active = item.active(pathname);
          const Icon = item.icon;
          const href = item.href === "/browse" ? browseHref : item.href;
          return (
            <Link
              key={item.label}
              href={href}
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 transition-colors duration-150"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              data-tap
              style={
                active
                  ? {
                      background: "var(--mobile-nav-active)",
                      color: "var(--mobile-nav-active-text)",
                    }
                  : {
                      color: "var(--mobile-nav-icon)",
                    }
              }
            >
              <span className="inline-flex items-center justify-center">
                <Icon active={active} />
              </span>
              <span className="text-[0.7rem] font-bold tracking-[0.01em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
