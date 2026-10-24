"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChapterReaderShell } from "@/components/ChapterReaderChrome";
import {
  chapterChromeForHref,
  chapterNavigationTarget,
  isPendingChapterVisible,
  type PendingChapterNavigation,
} from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";

type NavigateOptions = { replace?: boolean; scroll?: boolean };

/**
 * Starts a navigation through the Next router. A navigation to another chapter shows that chapter's page (with
 * its text area empty) in place of the current page at once, until the route commits; it returns false (doing
 * nothing) for any other href.
 */
type ChapterNavigate = (href: string, options?: NavigateOptions) => boolean;

const ChapterNavigationContext = createContext<ChapterNavigate | null>(null);

/** True inside a page that is hidden behind another chapter's page while that chapter's route is on its way. */
const PageCoveredContext = createContext(false);

/**
 * Whether this page is hidden behind a chapter that is opening. Such a page is still mounted (so an abandoned
 * navigation returns to it as it was) but must not act as the current page, e.g. as the notebook's source.
 */
export function usePageCoveredByChapterNavigation() {
  return useContext(PageCoveredContext);
}

/**
 * Wraps the browse pages. The router keeps the old page on screen until the next route's response starts
 * arriving; this swaps it for the destination chapter's page (ChapterReaderShell: its header, breadcrumbs, and
 * links, with no text yet) as soon as a chapter navigation starts, so feedback never waits on the network. The
 * chapter route streams its page before its text, so the router commits as soon as the response begins, and the
 * text fades in on the real page when it arrives. The pending state is the navigation's own transition, so a
 * cached chapter commits straight away, and Back, another navigation, or a failure all bring a page back.
 */
export function ChapterNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startTransition] = useTransition();
  const [pending, setPending] = useState<PendingChapterNavigation | null>(null);

  const navigate = useCallback<ChapterNavigate>(
    (href, options = {}) => {
      const fromPathname = window.location.pathname;
      const target = chapterNavigationTarget(fromPathname, href);
      if (!target) return false;
      setPending({ fromPathname, href, target });
      startTransition(() => {
        const routerOptions = { scroll: options.scroll ?? true };
        if (options.replace) router.replace(href, routerOptions);
        else router.push(href, routerOptions);
      });
      return true;
    },
    [router]
  );

  // `pending` is not cleared when the navigation settles: it is only shown while `navigating`, which is this
  // provider's own transition, and the next navigation replaces it.
  useEffect(() => {
    // Back/Forward while a chapter loads abandons it, even before the router has caught up.
    const onPopState = () => setPending(null);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const visible = isPendingChapterVisible(pending, { pathname, navigating });
  const pendingHref = pending?.href;
  const chrome = useMemo(
    () => (pendingHref ? chapterChromeForHref(scriptureCatalog, pendingHref) : null),
    [pendingHref]
  );

  useLayoutEffect(() => {
    // This is the top of the next chapter; show it from the top, as the chapter will be.
    if (visible) window.scrollTo({ top: 0 });
  }, [visible]);

  return (
    <ChapterNavigationContext.Provider value={navigate}>
      {visible && chrome ? <ChapterReaderShell chrome={chrome} /> : null}
      {/* The current page stays mounted (hidden) so an abandoned navigation returns to it as it was. */}
      <PageCoveredContext.Provider value={visible}>
        <div className={visible ? "hidden" : "contents"}>{children}</div>
      </PageCoveredContext.Provider>
    </ChapterNavigationContext.Provider>
  );
}

/** Navigate to an in-app href, showing another chapter's page at once when it opens one. Works outside /browse too. */
export function useChapterNavigation() {
  const navigate = useContext(ChapterNavigationContext);
  const router = useRouter();
  return useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (navigate?.(href, options)) return;
      const routerOptions = { scroll: options.scroll ?? true };
      if (options.replace) router.replace(href, routerOptions);
      else router.push(href, routerOptions);
    },
    [navigate, router]
  );
}

type ChapterLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/**
 * A Next link that shows the chapter it opens at once, before its route arrives. New-tab and modified clicks stay
 * with the browser, and anything that is not another chapter navigates exactly as a plain Link does.
 */
export function ChapterLink({ href, onNavigate, replace, scroll, ...rest }: ChapterLinkProps) {
  const navigate = useContext(ChapterNavigationContext);
  return (
    <Link
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled || !navigate) return;
        // A chapter navigation is taken over, and the provider runs it through the router in its own transition.
        if (navigate(href, { replace: !!replace, scroll: scroll ?? true })) event.preventDefault();
      }}
      {...rest}
    />
  );
}
