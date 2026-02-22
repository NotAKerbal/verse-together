"use client";

type Props = {
  visible: boolean;
  hasSelection: boolean;
  hasActiveInsight: boolean;
  showTranslations?: boolean;
  showPinToggle?: boolean;
  pinned?: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onLoadInsights: () => void;
  onCitations: () => void;
  onExplore: () => void;
  onTranslations: () => void;
  onTogglePin?: () => void;
  targetLabel?: string;
};

export default function DesktopVerseActionList({
  visible,
  hasSelection,
  hasActiveInsight,
  showTranslations = false,
  showPinToggle = false,
  pinned = false,
  actionsEnabled = true,
  onClear,
  onInsight,
  onNewInsight,
  onLoadInsights,
  onCitations,
  onExplore,
  onTranslations,
  onTogglePin,
  targetLabel = "Note",
}: Props) {
  if (!visible) return null;

  const baseBtn =
    "w-full text-left rounded-md border surface-button px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const topBtn =
    "w-full text-left rounded-md border surface-button px-3 py-2 text-sm";

  return (
    <div className="rounded-lg border surface-card backdrop-blur p-2 space-y-2">
      <div className="px-1 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/65">Actions</h3>
        {showPinToggle ? (
          <button
            onClick={onTogglePin}
            className={`inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs ${
              pinned ? "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "surface-button"
            }`}
            title={pinned ? "Unpin actions panel" : "Pin actions panel"}
            aria-label={pinned ? "Unpin actions panel" : "Pin actions panel"}
          >
            📌
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {showTranslations ? (
          <button onClick={onTranslations} className={topBtn}>
            Translations
          </button>
        ) : (
          <div />
        )}
        <button onClick={onLoadInsights} disabled={!actionsEnabled} className={topBtn}>
          Open {targetLabel === "Lesson" ? "Lesson" : "Notes"}
        </button>
      </div>
      <div className="h-px bg-black/10 dark:bg-white/10" />
      <div className="grid grid-cols-2 gap-1.5">
        {hasActiveInsight ? (
          <button onClick={onInsight} disabled={!actionsEnabled || !hasSelection} className={baseBtn}>
            Add to {targetLabel}
          </button>
        ) : (
          <button onClick={onNewInsight} disabled={!actionsEnabled || !hasSelection} className={baseBtn}>
            New {targetLabel}
          </button>
        )}
        <button onClick={onCitations} disabled={!hasSelection} className={baseBtn}>
          Citations
        </button>
        <button onClick={onExplore} disabled={!hasSelection} className={baseBtn}>
          Explore
        </button>
        <button onClick={onClear} disabled={!hasSelection} className={baseBtn}>
          Clear Selection
        </button>
      </div>
    </div>
  );
}
