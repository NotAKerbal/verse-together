"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readStorageValue } from "@/lib/clientStorage";
import { scheduleIdleTask } from "@/lib/idle";

const LAST_BROWSE_LOCATION_KEY = "browse:last-location";
const CORE_ROUTES = ["/browse", "/search", "/notes", "/feed", "/help"];

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
