"use client";

import { useEffect, useState } from "react";

/** True under Tailwind's lg breakpoint (1024px), false at or above it, null until the browser has answered. */
export function useBelowLg(): boolean | null {
  const [below, setBelow] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setBelow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return below;
}
