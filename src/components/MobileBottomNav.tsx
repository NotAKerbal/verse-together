"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { primaryNavIcons } from "@/components/primaryNavIcons";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();

  return (
    <nav
      className="simple-hide fixed inset-x-0 z-40 flex justify-center px-4 sm:hidden"
      style={{ bottom: "max(0.85rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary mobile navigation"
    >
      <div className="segmented-control mobile-nav-control pointer-events-auto w-full max-w-sm">
        {primaryNavItems.map((item) => {
          const active = isPathActive(pathname, item.href) || (item.href === "/browse" && pathname === "/");
          const href = item.href === "/browse" ? browseHref : item.href;
          return (
            <Link
              key={item.label}
              href={href}
              className="segmented-control-button mobile-nav-button"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              data-tap
            >
              <FontAwesomeIcon icon={primaryNavIcons[item.label]} className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className="mobile-nav-label" aria-hidden="true">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
