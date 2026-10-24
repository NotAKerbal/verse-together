"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import ChapterReaderSkeleton from "@/components/ChapterReaderSkeleton";
import {
  chapterNavigationTarget,
  describeChapterTarget,
  isChapterSkeletonVisible,
  type PendingChapterNavigation,
} from "@/lib/browseRoutes";
import { scriptureCatalog } from "@/lib/scriptureCatalog";

type NavigateOptions = { replace?: boolean; scroll?: boolean };

/**
 * Starts a navigation through the Next router. A navigation to another chapter shows the reader skeleton in place
 * of the current page at once, until the chapter renders; it returns false (doing nothing) for any other href.
 */
type ChapterNavigate = (href: string, options?: NavigateOptions) => boolean;

const ChapterNavigationContext = createContext<ChapterNavigate | null>(null);

/**
 * Wraps the browse pages. The router keeps the old page on screen until the next one's server render arrives;
 * this swaps it for the reader skeleton as soon as a chapter navigation starts, so feedback never waits on the
 * network. The pending state is the navigation's own transition, so when the chapter is already cached it
 * commits straight away, and Back, another navigation, or a failure all bring a page back.
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
      setPending({ fromPathname, target });
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

  const visible = isChapterSkeletonVisible(pending, { pathname, navigating });

  useLayoutEffect(() => {
    // The skeleton is the top of the next chapter; show it from the top, as the chapter will be.
    if (visible) window.scrollTo({ top: 0 });
  }, [visible]);

  return (
    <ChapterNavigationContext.Provider value={navigate}>
      {visible && pending ? (
        <ChapterReaderSkeleton reference={describeChapterTarget(scriptureCatalog, pending.target)} />
      ) : null}
      {/* The current page stays mounted (hidden) so an abandoned navigation returns to it as it was. */}
      <div className={visible ? "hidden" : "contents"}>{children}</div>
    </ChapterNavigationContext.Provider>
  );
}

/** Navigate to an in-app href, with the chapter skeleton when it opens another chapter. Works outside /browse too. */
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
 * A Next link that shows the chapter skeleton while a chapter it opens loads. New-tab and modified clicks stay
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
