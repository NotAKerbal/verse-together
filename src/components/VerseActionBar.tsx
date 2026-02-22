"use client";
import { useEffect, useRef, useState } from "react";
import type { FC } from "react";

export type Props = {
  visible: boolean;
  hasActiveInsight: boolean;
  showTranslations?: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onLoadInsights: () => void;
  onCitations: () => void;
  onExplore: () => void;
  onTranslations: () => void;
  targetLabel?: string;
};

const VerseActionBar: FC<Props> = ({
  visible,
  hasActiveInsight,
  showTranslations = false,
  actionsEnabled = true,
  onClear,
  onInsight,
  onNewInsight,
  onLoadInsights,
  onCitations,
  onExplore,
  onTranslations,
  targetLabel = "Note",
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
          className="inline-flex items-center justify-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md"
        >
          Clear
        </button>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {hasActiveInsight ? (
            <button
              onClick={onInsight}
              disabled={!actionsEnabled}
              className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md disabled:opacity-50"
            >
              ✍ Add to {targetLabel}
            </button>
          ) : (
            <>
              <button
                onClick={onNewInsight}
                disabled={!actionsEnabled}
                className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md disabled:opacity-50"
              >
                + New {targetLabel}
              </button>
              <button
                onClick={onLoadInsights}
                disabled={!actionsEnabled}
                className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md disabled:opacity-50"
              >
                Open {targetLabel === "Lesson" ? "Lesson" : "Notes"}
              </button>
            </>
          )}
          <button
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-label="More actions"
            title="More"
            className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md"
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
              className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md"
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
              className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md"
              title="Verse Explorer"
              aria-label="Verse Explorer"
            >
              🔎 Explore
            </button>
            {showTranslations ? (
              <>
                <div className="h-1" />
                <button
                  onClick={() => {
                    toggleMenu();
                    onTranslations();
                  }}
                  className="inline-flex items-center rounded-full border surface-button backdrop-blur px-4 py-2 text-base shadow-md"
                  title="Translations"
                  aria-label="Translations"
                >
                  🌐 Translations
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VerseActionBar;
