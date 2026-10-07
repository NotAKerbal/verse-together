"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";

type Props = {
  /**
   * "header": the compact control in the desktop app header.
   * "page": the phone control at the top right of a page (Notes, Plans). The desktop header already
   * carries the account from 640px up, so this one shows only below that.
   */
  variant?: "header" | "page";
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

function AccountControlInner({ variant }: { variant: "header" | "page" }) {
  const { user, loading } = useAuth();

  // Until Clerk knows who this is, hold the space quietly rather than offering a false Sign in.
  if (loading) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] ${
          variant === "page" ? "h-11 w-11" : "h-10 w-10"
        }`}
      />
    );
  }

  if (user) {
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
      <button type="button" className={variant === "page" ? SIGN_IN_PAGE_CLASS : SIGN_IN_HEADER_CLASS}>
        Sign in
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
  return <AccountControlInner variant="header" />;
}
