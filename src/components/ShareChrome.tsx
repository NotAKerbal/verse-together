"use client";

import { useEffect } from "react";

/*
  Mounted only on /share passage pages. Flags <html data-share="true"> so
  globals.css can hide the app chrome (header, mobile nav, simple-mode pill)
  and drop the main padding without touching the root layout for other routes.
*/
export default function ShareChrome() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-share", "true");
    return () => {
      root.removeAttribute("data-share");
    };
  }, []);

  return null;
}
