"use client";

import { createContext, useContext, type ComponentPropsWithoutRef } from "react";
import { ChapterLink } from "@/components/ChapterNavigation";
import { isBrowseSelectionHref, isPlainLeftClick } from "@/lib/browseRoutes";

/** Provided by BrowseSelector: shows another selection view in place, without a server round trip. */
export const BrowseNavigationContext = createContext<((href: string) => void) | null>(null);

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

/**
 * A real link (it opens in a new tab, survives reload, and works before hydration). Inside the browse selector a
 * plain click on another selection view switches it client-side; a chapter (e.g. a one-chapter book's only one),
 * and anything outside the selector, goes through the Next router, with the chapter skeleton while it loads.
 */
export default function BrowseLink({ href, onClick, children, ...rest }: Props) {
  const navigate = useContext(BrowseNavigationContext);

  if (!navigate || !isBrowseSelectionHref(href)) {
    return (
      <ChapterLink href={href} onClick={onClick} {...rest}>
        {children}
      </ChapterLink>
    );
  }

  return (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (!isPlainLeftClick(event, rest.target)) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
