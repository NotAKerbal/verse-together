"use client";

type Props = {
  visible: boolean;
  hasSelection: boolean;
  hasActiveInsight: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onLoadInsights: () => void;
  onCitations: () => void;
  onExplore: () => void;
};

export default function DesktopVerseActionList({
  visible,
  hasSelection,
  hasActiveInsight,
  actionsEnabled = true,
  onClear,
  onInsight,
  onNewInsight,
  onLoadInsights,
  onCitations,
  onExplore,
}: Props) {
  if (!visible) return null;

  const baseBtn =
    "w-full text-left rounded-md border border-black/10 dark:border-white/15 bg-background/70 px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 backdrop-blur p-2 space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-foreground/65">Actions</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {hasActiveInsight ? (
          <button onClick={onInsight} disabled={!actionsEnabled || !hasSelection} className={baseBtn}>
            Add to Note
          </button>
        ) : (
          <>
            <button onClick={onNewInsight} disabled={!actionsEnabled || !hasSelection} className={baseBtn}>
              New Note
            </button>
            <button onClick={onLoadInsights} disabled={!actionsEnabled} className={baseBtn}>
              Open Notes
            </button>
          </>
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
