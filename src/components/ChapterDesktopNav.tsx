"use client";

import { useEffect } from "react";
import { ChapterLink, useChapterNavigation } from "./ChapterNavigation";
import { chapterArrowHref } from "@/lib/chapterKeyboardNavigation";

type Props = {
  prevHref?: string;
  nextHref?: string;
  /** Hidden pages and readers with an active study interaction must not navigate on arrow keys. */
  shortcutsBlocked: boolean;
};

export default function ChapterDesktopNav({ prevHref, nextHref, shortcutsBlocked }: Props) {
  const navigate = useChapterNavigation();

  useEffect(() => {
    if (shortcutsBlocked) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target instanceof Element ? event.target : null;
      const interactive = !!target?.closest(
        'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [role="combobox"], [role="slider"], [role="tab"], [role="menu"], [role="listbox"], [role="tree"], [tabindex]:not([tabindex="-1"]), .cm-editor'
      );
      // Some panels are portalled outside the reader. A visible dialog owns the keyboard even if focus is on the page.
      const dialogOpen = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'))
        .some((dialog) => dialog.getClientRects().length > 0);
      const href = chapterArrowHref(event, {
        prevHref,
        nextHref,
        desktop: window.matchMedia("(min-width: 1024px)").matches,
        blocked: interactive || dialogOpen || !!window.getSelection()?.toString(),
      });
      if (!href) return;
      event.preventDefault();
      navigate(href);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prevHref, nextHref, shortcutsBlocked, navigate]);

  if (!nextHref) return null;
  return (
    <nav aria-label="Next chapter" className="simple-hide mt-8 hidden lg:flex lg:justify-end">
      <ChapterLink
        href={nextHref}
        rel="next"
        aria-keyshortcuts="ArrowRight"
        className="inline-flex min-h-11 items-center gap-2 rounded-sm px-1 text-sm text-[color:var(--foreground-muted)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
      >
        Next chapter <span aria-hidden="true">&rarr;</span>
      </ChapterLink>
    </nav>
  );
}
