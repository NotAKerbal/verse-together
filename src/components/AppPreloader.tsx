"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readStorageValue } from "@/lib/clientStorage";
import { scheduleIdleTask } from "@/lib/idle";

const LAST_BROWSE_LOCATION_KEY = "browse:last-location";
const CORE_ROUTES = ["/browse", "/plans", "/search", "/notes", "/feed", "/help"];

/**
 * Warms the main navigation destinations once per session, while idle, and the reader's last Library location
 * when it changes. Volume and book selection need no prefetch (they render from the bundled catalog), and the
 * reader itself warms its neighbouring chapters, so this no longer refetches anything on every route change.
 */
export default function AppPreloader() {
  const pathname = usePathname();
  const router = useRouter();
  const prefetched = useRef(new Set<string>());

  useEffect(() => {
    const onBrowse = pathname === "/browse" || pathname.startsWith("/browse/");
    const storedBrowseHref = onBrowse ? null : readStorageValue("session", LAST_BROWSE_LOCATION_KEY);
    const pending = [...CORE_ROUTES, ...(storedBrowseHref ? [storedBrowseHref] : [])].filter(
      (href) => href !== pathname && !prefetched.current.has(href)
    );
    if (pending.length === 0) return;

    return scheduleIdleTask(() => {
      pending.forEach((href) => {
        prefetched.current.add(href);
        router.prefetch(href);
      });
    });
  }, [pathname, router]);

  return null;
}
