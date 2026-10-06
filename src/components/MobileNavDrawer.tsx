"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import { useBrowseNavHref } from "@/lib/browseNavigation";
import { isPathActive, primaryNavItems } from "@/lib/navigation";

type Props = {
  open: boolean;
  onClose: () => void;
};

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BookIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M4 5h7v14H4z" />
      <path d="M13 5h7v14h-7z" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

function ListCheckIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="m3.5 6.5 1.5 1.5 3-3" />
      <path d="M11 7h9" />
      <path d="m3.5 12.5 1.5 1.5 3-3" />
      <path d="M11 13h9" />
      <path d="M4 19h4" />
      <path d="M11 19h9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

const drawerIcons: Record<string, typeof BookIcon> = {
  "/browse": BookIcon,
  "/notes": LightbulbIcon,
  "/plans": ListCheckIcon,
};

const drawerTints: Record<string, string> = {
  "/browse": "var(--accent-primary)",
  "/notes": "var(--accent-note)",
  "/plans": "var(--accent-mint)",
};

export default function MobileNavDrawer({ open, onClose }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
  const browseHref = useBrowseNavHref();
  const [isClosing, setIsClosing] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const navItems = primaryNavItems;

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
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 will-change-[opacity] ${open && !isClosing && hasEntered ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-y-0 left-0 flex w-[22.5rem] max-w-[92vw] flex-col border-r-2 border-[color:var(--surface-border)] p-4 transition-transform duration-200 ease-out will-change-[transform] ${open && !isClosing && hasEntered ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          backgroundColor: "var(--background)",
          backgroundImage: "radial-gradient(var(--paper-dot) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="brand-wordmark text-[1.4rem]">
              Verse<span>Together</span>
            </p>
            <p className="text-sm text-[color:var(--foreground-muted)]">Read, take notes, share what you find.</p>
          </div>
          <button
            onClick={requestClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 surface-button text-[color:var(--foreground)]"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="mt-6 grid gap-2.5" aria-label="Mobile menu">
          {navItems.map((item) => {
            const active = isPathActive(pathname, item.href);
            const Icon = drawerIcons[item.href];
            const href = item.href === "/browse" ? browseHref : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                onClick={requestClose}
                className="flex min-h-14 items-center gap-3 rounded-[1rem] border-2 border-[color:var(--surface-border)] px-3 py-2.5 transition-colors duration-150"
                aria-current={active ? "page" : undefined}
                data-tap
                style={
                  active
                    ? {
                        background: "var(--surface-button-active)",
                        color: "var(--surface-button-active-text)",
                        boxShadow: "var(--surface-shadow-soft)",
                      }
                    : {
                        background: "var(--surface-card)",
                        color: "var(--foreground)",
                      }
                }
              >
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)]"
                  style={{
                    background: active ? "var(--surface-card)" : drawerTints[item.href] ?? "var(--surface-card)",
                    color: "#17161a",
                  }}
                >
                  <Icon />
                </span>
                <span className="text-[0.95rem] font-bold">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {user ? (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-3">
            <p className="text-sm font-bold">Account</p>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-8 w-8",
                },
              }}
              afterSignOutUrl="/"
            />
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          {!user ? (
            <SignInButton mode="modal">
              <button className="w-full rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 py-3 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]">
                Sign in
              </button>
            </SignInButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
