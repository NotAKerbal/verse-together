"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const BROWSE_LAST_LOCATION_KEY = "browse:last-location";

function buildBrowseLocation(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function useBrowseNavHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [lastBrowseHref, setLastBrowseHref] = useState("/browse");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedHref = window.sessionStorage.getItem(BROWSE_LAST_LOCATION_KEY);
    if (storedHref) {
      setLastBrowseHref(storedHref);
    }
  }, []);

  useEffect(() => {
    if (!pathname.startsWith("/browse")) return;

    const currentHref = buildBrowseLocation(pathname, new URLSearchParams(searchParams.toString()));
    if (currentHref === "/browse") return;

    window.sessionStorage.setItem(BROWSE_LAST_LOCATION_KEY, currentHref);
    setLastBrowseHref(currentHref);
  }, [pathname, searchParams]);

  if (pathname.startsWith("/browse")) {
    return "/browse";
  }

  return lastBrowseHref;
}
