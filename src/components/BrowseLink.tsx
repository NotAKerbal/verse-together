"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentPropsWithoutRef } from "react";
import { isPlainLeftClick } from "@/lib/browseRoutes";

/** Provided by BrowseSelector: shows another selection view in place, without a server round trip. */
export const BrowseNavigationContext = createContext<((href: string) => void) | null>(null);

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

/**
 * A real link (it opens in a new tab, survives reload, and works before hydration). Inside the browse selector a
 * plain click switches the selection view client-side; anywhere else it is an ordinary Next link.
 */
export default function BrowseLink({ href, onClick, children, ...rest }: Props) {
  const navigate = useContext(BrowseNavigationContext);

  if (!navigate) {
    return (
      <Link href={href} onClick={onClick} {...rest}>
        {children}
      </Link>
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
