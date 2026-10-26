"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { SIGN_OUT_FAILED, useAuth } from "@/lib/auth";

type AccountVariant = "header" | "page" | "dock";

// The session may resolve before a streamed header hydrates. Keep the first render identical to the
// server's placeholder, then show the live account state.
const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

type Props = {
  /**
   * "header": the compact control in the desktop app header.
   * "page": the phone control at the top right of a page (Notes, Plans). The desktop header already
   * carries the account from 640px up, so this one shows only below that.
   * "dock": the icon-only account control in the floating desktop navigation.
   */
  variant?: AccountVariant;
};

const SIGN_IN_HEADER_CLASS =
  "inline-flex min-h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 py-1.5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

// Page controls use the quieter button style.
const SIGN_IN_PAGE_CLASS =
  "surface-button inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

const MENU_ITEM_CLASS =
  "block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

// Gap between the trigger and the menu, and the menu's minimum distance from the viewport edges.
const MENU_GAP = 8;

/**
 * Pin the menu under the trigger, right-aligned to it, kept inside the viewport (above the trigger when
 * there's no room below). Writes the style directly so scroll and resize can follow without re-rendering.
 * Returns false, leaving the menu hidden, when the trigger isn't on screen to anchor it (e.g. the dock is
 * display:none past a breakpoint, or the page scrolled it away).
 */
function placeMenu(trigger: HTMLElement, menu: HTMLElement): boolean {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const anchor = trigger.getBoundingClientRect();
  const onScreen =
    trigger.getClientRects().length > 0 &&
    anchor.width > 0 &&
    anchor.height > 0 &&
    anchor.bottom > 0 &&
    anchor.right > 0 &&
    anchor.top < viewportHeight &&
    anchor.left < viewportWidth;
  if (!onScreen) {
    menu.style.visibility = "hidden";
    return false;
  }
  const { width, height } = menu.getBoundingClientRect();
  const left = Math.min(Math.max(MENU_GAP, anchor.right - width), viewportWidth - width - MENU_GAP);
  const below = anchor.bottom + MENU_GAP;
  const above = anchor.top - MENU_GAP - height;
  const top = below + height > viewportHeight - MENU_GAP && above >= MENU_GAP ? above : below;
  menu.style.left = `${Math.max(MENU_GAP, left)}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
  return true;
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

function AccountMenu({ variant }: { variant: AccountVariant }) {
  const { user, authUser, error, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const name = user?.fullName ?? authUser?.name ?? null;
  const email = user?.email ?? authUser?.email ?? null;
  const imageUrl = user?.imageUrl ?? authUser?.image ?? null;

  // The menu renders in a portal on <body>: the floating desktop navigation clips its overflow (for the
  // collapse animation), which would cut off and swallow clicks on an inline menu. It stays anchored to the
  // trigger as the page scrolls or the window resizes, and closes once the trigger is hidden or off screen.
  useLayoutEffect(() => {
    // Every render while open: the menu's height changes when a sign-out error appears.
    if (open && triggerRef.current && menuRef.current) placeMenu(triggerRef.current, menuRef.current);
  });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (triggerRef.current && menuRef.current && !placeMenu(triggerRef.current, menuRef.current)) setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (containerRef.current?.contains(target) || menuRef.current?.contains(target));
    function onPointerDown(event: PointerEvent) {
      if (!isInside(event.target)) setOpen(false);
    }
    // Keyboard counterpart of an outside click, e.g. tabbing on to the navigation's collapse toggle.
    function onFocusIn(event: FocusEvent) {
      if (!isInside(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The portal sits at the end of <body>, so keep the tab order as if the menu followed the trigger:
  // Tab from the trigger enters the menu, and leaving either end of the menu returns past the trigger.
  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open || event.key !== "Tab" || event.shiftKey) return;
    const first = menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])");
    if (!first) return;
    event.preventDefault();
    first.focus();
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    if (items.length === 0) return;
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      triggerRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
      // Move focus back to the trigger and let the browser's Tab continue from there; focus then lands
      // outside the menu, which closes it.
      triggerRef.current?.focus();
    }
  }

  const size =
    variant === "dock"
      ? "h-[var(--desktop-nav-control-size)] w-[var(--desktop-nav-control-size)] border-0 bg-[color:var(--surface-card-soft)]"
      : variant === "page"
        ? "h-11 w-11 border-2 bg-[color:var(--surface-card)]"
        : "h-10 w-10 border-2 bg-[color:var(--surface-card)]";
  const avatar =
    variant === "dock" ? "h-[calc(var(--desktop-nav-control-size)-0.75rem)] w-[calc(var(--desktop-nav-control-size)-0.75rem)]" : variant === "page" ? "h-9 w-9" : "h-8 w-8";

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu${name || email ? ` for ${name || email}` : ""}`}
        onClick={() => {
          setSignOutError(null);
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
        className={`inline-flex ${size} items-center justify-center rounded-full border-[color:var(--surface-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote avatar from the identity provider
          <img src={imageUrl} alt="" referrerPolicy="no-referrer" className={`${avatar} rounded-full object-cover`} />
        ) : (
          <span
            aria-hidden="true"
            className={`${avatar} inline-flex items-center justify-center rounded-full bg-[color:var(--surface-button-active)] text-xs font-bold text-[color:var(--surface-button-active-text)]`}
          >
            {initials(name, email)}
          </span>
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              onKeyDown={onMenuKeyDown}
              // Hidden at the origin until placeMenu measures it, before the first paint.
              style={{ left: 0, top: 0, visibility: "hidden" }}
              className="fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-2xl border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] p-2 shadow-[var(--surface-shadow-lift)]"
            >
              <div className="px-3 py-2">
                {name ? <div className="truncate text-sm font-semibold">{name}</div> : null}
                {email ? <div className="truncate text-xs text-[color:var(--foreground-muted)]">{email}</div> : null}
                {error ? <div className="mt-1 text-xs font-semibold text-[color:var(--accent-secondary)]">{error}</div> : null}
              </div>
              {signOutError ? (
                <p role="alert" className="px-3 pb-2 text-xs font-semibold text-[color:var(--accent-secondary)]">
                  {signOutError}
                </p>
              ) : null}
              <Link href="/account" className={MENU_ITEM_CLASS} onClick={() => setOpen(false)}>
                Manage account
              </Link>
              <button
                type="button"
                className={MENU_ITEM_CLASS}
                disabled={signingOut}
                aria-busy={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  setSignOutError(null);
                  try {
                    await signOut();
                    setOpen(false);
                    router.replace("/");
                  } catch (signOutFailure) {
                    setSignOutError(signOutFailure instanceof Error ? signOutFailure.message : SIGN_OUT_FAILED);
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function AccountControlInner({ variant }: { variant: AccountVariant }) {
  const { user, authUser, error, loading, promptSignIn, signingIn } = useAuth();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);

  // Until the session is known, hold the space quietly rather than offering a false Sign in.
  if (!hydrated || loading) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] ${
          variant === "dock"
            ? "desktop-nav-account-placeholder h-[var(--desktop-nav-control-size)] w-[var(--desktop-nav-control-size)]"
            : variant === "header"
              ? "h-10 w-10"
              : "h-11 w-11"
        }`}
      />
    );
  }

  if (user || (error && authUser)) {
    return <AccountMenu variant={variant} />;
  }

  return (
    <button
      type="button"
      onClick={() => promptSignIn()}
      disabled={signingIn}
      aria-busy={signingIn || undefined}
      className={`${variant === "dock" ? "desktop-nav-account-control" : variant === "page" ? SIGN_IN_PAGE_CLASS : SIGN_IN_HEADER_CLASS} disabled:cursor-wait disabled:opacity-70`}
      aria-label={variant === "dock" ? (signingIn ? "Signing in…" : "Sign in to sync") : undefined}
      title={variant === "dock" ? (signingIn ? "Signing in…" : "Sign in to sync") : undefined}
    >
      {variant === "dock" ? <FontAwesomeIcon icon={faUser} className="h-4 w-4" aria-hidden="true" /> : signingIn ? "Signing in…" : "Sign in to sync"}
    </button>
  );
}

/** The account avatar (manage-account and sign-out menu), or Sign in when signed out. */
export default function AccountControl({ variant = "header" }: Props) {
  if (variant === "page") {
    return (
      <div className="simple-hide flex shrink-0 items-center justify-end sm:hidden">
        <AccountControlInner variant="page" />
      </div>
    );
  }
  return <AccountControlInner variant={variant} />;
}
