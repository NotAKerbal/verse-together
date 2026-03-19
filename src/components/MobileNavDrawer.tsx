"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import ThemeSelect from "@/components/ThemeSelect";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

type Props = {
  open: boolean;
  onClose: () => void;
};

function BookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 4.75A2.75 2.75 0 0 1 8.25 2h9.25v16.25H8.25A2.75 2.75 0 0 0 5.5 21V4.75Z" />
      <path d="M5.5 19.25A2.75 2.75 0 0 1 8.25 16.5H17.5V21H8.25A2.75 2.75 0 0 1 5.5 18.25v1Z" />
      <path d="M9 6.5h5.5" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15h4.5" />
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h4.5" />
      <path d="m14.5 14.5 1.5 1.5 3-3" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M9.75 9.25a2.25 2.25 0 1 1 3.25 2.02c-.9.47-1.5 1.07-1.5 2.23" />
      <path d="M12 16.75h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

const drawerIcons: Record<(typeof primaryNavItems)[number]["href"], typeof BookIcon> = {
  "/browse": BookIcon,
  "/feed": NotesIcon,
  "/plans": PlansIcon,
  "/help": GuideIcon,
};

export default function MobileNavDrawer({ open, onClose }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [isClosing, setIsClosing] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setIsClosing(false);
      setHasEntered(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setHasEntered(true)));
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    setHasEntered(false);
  }, [open]);

  if (!open && !isClosing) return null;

  function requestClose() {
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  }

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        aria-label="Close menu"
        onClick={requestClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 will-change-[opacity] ${open && !isClosing && hasEntered ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-y-0 left-0 flex w-[22.5rem] max-w-[92vw] flex-col border-r border-[color:var(--surface-border)] p-4 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out will-change-[transform] ${open && !isClosing && hasEntered ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--mobile-nav-shell) 96%, white 4%), var(--surface-card-strong))",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.28), inset -1px 0 0 color-mix(in oklab, var(--mobile-nav-ring) 100%, transparent)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--mobile-nav-icon)]">
              Navigate
            </p>
            <h2 className="text-lg font-semibold tracking-[0.01em]">Verse Together</h2>
          </div>
          <button
            onClick={requestClose}
            className="inline-flex h-9 w-9 items-center justify-center text-[color:var(--foreground)]"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="mt-6 grid gap-2" aria-label="Mobile menu">
          {primaryNavItems.map((item) => {
            const active = isPathActive(pathname, item.href);
            const Icon = drawerIcons[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={requestClose}
                className="flex min-h-16 items-center gap-3 rounded-[1.35rem] border px-4 py-3 transition-all duration-200"
                aria-current={active ? "page" : undefined}
                data-tap
                style={
                  active
                    ? {
                        borderColor: "color-mix(in oklab, var(--mobile-nav-active) 78%, var(--surface-border))",
                        background: "var(--mobile-nav-active)",
                        color: "var(--mobile-nav-active-text)",
                        boxShadow:
                          "0 10px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.16)",
                      }
                    : {
                        borderColor: "var(--surface-border)",
                        background: "var(--surface-button)",
                        color: "var(--foreground)",
                      }
                }
              >
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{
                    background: active
                      ? "color-mix(in oklab, var(--mobile-nav-active-text) 10%, transparent)"
                      : "color-mix(in oklab, var(--mobile-nav-shell) 88%, transparent)",
                    color: active ? "var(--mobile-nav-active-text)" : "var(--mobile-nav-icon)",
                  }}
                >
                  <Icon />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-[color:var(--mobile-nav-icon)]">
                    {active ? "Current section" : "Open section"}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-[1.5rem] border border-[color:var(--surface-border)] p-3 surface-card-soft">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Appearance</p>
              <p className="text-xs text-[color:var(--mobile-nav-icon)]">Theme and account</p>
            </div>
            {user ? (
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8",
                  },
                }}
                afterSignOutUrl="/"
              />
            ) : null}
          </div>
          <ThemeSelect compact />
        </div>

        <div className="mt-auto pt-4">
          {!user ? (
            <SignInButton mode="modal">
              <button className="w-full rounded-[1.2rem] bg-[color:var(--surface-button-active)] px-4 py-3 text-sm font-medium text-[color:var(--surface-button-active-text)]">
                Sign in
              </button>
            </SignInButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
