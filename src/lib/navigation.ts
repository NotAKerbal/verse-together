export const primaryNavItems = [
  { href: "/browse", label: "Browse" },
  { href: "/feed", label: "Notes" },
  { href: "/plans", label: "Plans" },
  { href: "/help", label: "Guide" },
] as const;

export function isPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isReaderPath(pathname: string) {
  return /^\/browse\/[^/]+\/[^/]+\/[^/]+$/.test(pathname);
}

export function isBrowseDiscoveryPath(pathname: string) {
  if (pathname === "/browse") return true;
  return /^\/browse\/[^/]+(?:\/[^/]+)?$/.test(pathname);
}
