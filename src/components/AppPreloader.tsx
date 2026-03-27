"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const LAST_BROWSE_LOCATION_KEY = "browse:last-location";
const CORE_ROUTES = ["/browse", "/search", "/feed", "/help"];

function scheduleIdleTask(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => callback(), { timeout: 1200 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = globalThis.setTimeout(callback, 250);
  return () => globalThis.clearTimeout(handle);
}

function buildCurrentHref(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getVolumeFromBrowseHref(href: string | null) {
  if (!href) return null;
  const [pathname] = href.split("?");
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "browse" || parts.length < 2) return null;
  return decodeURIComponent(parts[1] ?? "");
}

export default function AppPreloader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const currentHref = buildCurrentHref(pathname, new URLSearchParams(searchParams.toString()));
    const storedBrowseHref =
      typeof window === "undefined" ? null : window.sessionStorage.getItem(LAST_BROWSE_LOCATION_KEY);
    const preferredBrowseHref = pathname.startsWith("/browse") ? currentHref : storedBrowseHref;

    const cancel = scheduleIdleTask(() => {
      const routesToPrefetch = new Set(CORE_ROUTES);
      if (preferredBrowseHref && preferredBrowseHref !== "/browse") {
        routesToPrefetch.add(preferredBrowseHref);
      }

      routesToPrefetch.forEach((href) => router.prefetch(href));

      const preloadVolume = getVolumeFromBrowseHref(preferredBrowseHref);
      if (!preloadVolume) return;

      void import("@/lib/browserScriptureStorage")
        .then(({ preloadBrowserScriptureManifest, preloadBrowserScriptureVolume }) =>
          preloadBrowserScriptureManifest().then(() => preloadBrowserScriptureVolume(preloadVolume))
        )
        .catch(() => {
          // Ignore preload failures; they should not affect navigation.
        });
    });

    return cancel;
  }, [pathname, router, searchParams]);

  return null;
}
