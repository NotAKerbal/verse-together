"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { useSyncExternalStore } from "react";

type AccountVariant = "header" | "page" | "dock";

// Clerk may finish loading before a streamed header hydrates. Keep its first render
// identical to the server's placeholder, then show the live account state.
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
  "inline-flex min-h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 py-1.5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] hover:opacity-90";

// Secondary style: the signed-out pages already lead with their own primary Sign in button.
const SIGN_IN_PAGE_CLASS =
  "surface-button inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

// Object styles, not classes: Clerk's own (unlayered) styles would win over Tailwind's layered utilities.
// The trigger itself is the 44px hit target; the avatar sits inside its ring.
const PAGE_USER_BUTTON_ELEMENTS = {
  userButtonTrigger: {
    width: "2.75rem",
    height: "2.75rem",
    justifyContent: "center",
    borderRadius: "999px",
    border: "2px solid var(--surface-border)",
    background: "var(--surface-card)",
  },
  userButtonAvatarBox: {
    width: "2.25rem",
    height: "2.25rem",
  },
};

function AccountControlInner({ variant }: { variant: AccountVariant }) {
  const { user, loading } = useAuth();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);

  // Until Clerk knows who this is, hold the space quietly rather than offering a false Sign in.
  if (!hydrated || loading) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] ${
          variant === "dock" ? "desktop-nav-account-placeholder" : variant === "header" ? "h-10 w-10" : "h-11 w-11"
        }`}
      />
    );
  }

  if (user) {
    if (variant === "dock") {
      return (
        <UserButton
          appearance={{
            elements: {
              userButtonTrigger: {
                width: "var(--desktop-nav-control-size)",
                height: "var(--desktop-nav-control-size)",
                justifyContent: "center",
                borderRadius: "999px",
                background: "var(--surface-card-soft)",
              },
              userButtonAvatarBox: {
                width: "calc(var(--desktop-nav-control-size) - 0.75rem)",
                height: "calc(var(--desktop-nav-control-size) - 0.75rem)",
              },
            },
          }}
          afterSignOutUrl="/"
        />
      );
    }
    return variant === "page" ? (
      <span className="inline-flex shrink-0">
        <UserButton appearance={{ elements: PAGE_USER_BUTTON_ELEMENTS }} afterSignOutUrl="/" />
      </span>
    ) : (
      <span className="inline-flex rounded-full border-2 border-[color:var(--surface-border)] p-0.5">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-8 w-8",
            },
          }}
          afterSignOutUrl="/"
        />
      </span>
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className={variant === "dock" ? "desktop-nav-account-control" : variant === "page" ? SIGN_IN_PAGE_CLASS : SIGN_IN_HEADER_CLASS}
        aria-label={variant === "dock" ? "Sign in" : undefined}
        title={variant === "dock" ? "Sign in" : undefined}
      >
        {variant === "dock" ? <FontAwesomeIcon icon={faUser} className="h-4 w-4" aria-hidden="true" /> : "Sign in"}
      </button>
    </SignInButton>
  );
}

/** The account avatar (Clerk's manage-account and sign-out menu), or Sign in when signed out. */
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
