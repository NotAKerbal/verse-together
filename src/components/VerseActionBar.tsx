"use client";
import { useEffect, useRef, useState } from "react";
import type { FC } from "react";

export type Props = {
  visible: boolean;
  hasActiveInsight: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onLoadInsights: () => void;
  onCitations: () => void;
  onExplore: () => void;
};

const VerseActionBar: FC<Props> = ({
  visible,
  hasActiveInsight,
  actionsEnabled = true,
  onClear,
  onInsight,
  onNewInsight,
  onLoadInsights,
  onCitations,
  onExplore,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  function toggleMenu() {
    if (!menuOpen) {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMenuMounted(true);
      requestAnimationFrame(() => setMenuOpen(true));
    } else {
      setMenuOpen(false);
      closeTimerRef.current = window.setTimeout(() => {
        setMenuMounted(false);
        closeTimerRef.current = null;
      }, 180);
    }
  }

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("mobile-verse-action-menu-toggle", {
        detail: { open: menuOpen },
      })
    );
  }, [menuOpen]);

  if (!visible) return null;
  return (
    <div
      data-mobile-verse-action-bar="true"
      data-mobile-verse-action-menu-open={menuOpen ? "true" : "false"}
      className="fixed inset-x-0 z-50 pointer-events-none lg:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="mx-auto max-w-3xl flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 pointer-events-auto">
        <button
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          className="inline-flex items-center justify-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
        >
          Clear
        </button>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {hasActiveInsight ? (
            <button
              onClick={onInsight}
              disabled={!actionsEnabled}
              className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            >
              ✍ Add to Insight
            </button>
          ) : (
            <>
              <button
                onClick={onNewInsight}
                disabled={!actionsEnabled}
                className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              >
                + New Insight
              </button>
              <button
                onClick={onLoadInsights}
                disabled={!actionsEnabled}
                className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              >
                Load
              </button>
            </>
          )}
          <button
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-label="More actions"
            title="More"
            className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
          >
            + More
          </button>
        </div>
      </div>

      {menuMounted ? (
        <div
          data-mobile-verse-action-menu-panel="true"
          className="fixed right-3 sm:right-4 z-[60] flex flex-col items-end gap-1 pointer-events-auto"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }}
        >
          <div
            style={{
              transform: menuOpen ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
              opacity: menuOpen ? 1 : 0,
              transition: "opacity 180ms ease, transform 180ms ease",
              transformOrigin: "bottom right",
            }}
          >
            <button
              onClick={() => {
                toggleMenu();
                onCitations();
              }}
              className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/90 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
              title="Citations"
              aria-label="Citations"
            >
              🎤 Citations
            </button>
            <div className="h-1" />
            <button
              onClick={() => {
                toggleMenu();
                onExplore();
              }}
              className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/90 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
              title="Verse Explorer"
              aria-label="Verse Explorer"
            >
              🔎 Explore
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VerseActionBar;


