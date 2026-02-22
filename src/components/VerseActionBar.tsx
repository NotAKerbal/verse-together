"use client";
import { useEffect, useState } from "react";
import type { FC } from "react";

export type Props = {
  visible: boolean;
  hasSelection: boolean;
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
  hasSelection,
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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!visible) {
      setExpanded(false);
      return;
    }
    setExpanded(hasSelection);
  }, [visible, hasSelection]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("mobile-verse-action-menu-toggle", {
        detail: { open: visible && expanded },
      })
    );
  }, [visible, expanded]);

  if (!visible) return null;
  return (
    <div
      data-mobile-verse-action-bar="true"
      data-mobile-verse-action-menu-open={expanded ? "true" : "false"}
      className="fixed inset-x-0 bottom-0 z-50 pointer-events-none lg:hidden"
    >
      <div className="mx-auto max-w-3xl px-2 sm:px-3 pointer-events-auto">
        <div
          className="rounded-t-2xl border border-b-0 surface-card backdrop-blur-lg shadow-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-center gap-2 px-2.5 py-2.5">
            <button
              onClick={onClear}
              aria-label="Clear selection"
              title="Clear selection"
              disabled={!hasSelection}
              className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
            >
              Clear
            </button>
            <div className="min-w-0 flex-1 text-xs text-foreground/65">
              Verse actions
            </div>
            <button
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls="mobile-verse-actions-panel"
              className="inline-flex items-center rounded-md border surface-button px-3 py-2 text-sm"
            >
              {expanded ? "Hide" : "Actions"}
            </button>
          </div>

          <div
            id="mobile-verse-actions-panel"
            data-mobile-verse-action-menu-panel="true"
            className={`overflow-hidden transition-all duration-200 ease-out ${
              expanded ? "max-h-72 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
            }`}
          >
            <div className="border-t border-black/10 dark:border-white/10 px-2.5 py-2.5">
              <div className="grid grid-cols-2 gap-2">
                {hasActiveInsight ? (
                  <button
                    onClick={onInsight}
                    disabled={!actionsEnabled || !hasSelection}
                    className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Add to {targetLabel}
                  </button>
                ) : (
                  <button
                    onClick={onNewInsight}
                    disabled={!actionsEnabled || !hasSelection}
                    className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
                  >
                    New {targetLabel}
                  </button>
                )}
                <button
                  onClick={onLoadInsights}
                  disabled={!actionsEnabled}
                  className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
                >
                  Open {targetLabel === "Lesson" ? "Lesson" : "Notes"}
                </button>
                <button
                  onClick={onCitations}
                  disabled={!hasSelection}
                  className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
                  title="Citations"
                  aria-label="Citations"
                >
                  Citations
                </button>
                <button
                  onClick={onExplore}
                  disabled={!hasSelection}
                  className="inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50"
                  title="Verse Explorer"
                  aria-label="Verse Explorer"
                >
                  Explore
                </button>
                {showTranslations ? (
                  <button
                    onClick={onTranslations}
                    className="col-span-2 inline-flex items-center justify-center rounded-md border surface-button px-3 py-2 text-sm"
                    title="Translations"
                    aria-label="Translations"
                  >
                    Translations
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-black/10 dark:bg-white/10 pointer-events-none" />
    </div>
  );
};

export default VerseActionBar;
