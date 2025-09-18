"use client";

type Props = {
  visible: boolean;
  onClear: () => void;
  onShare: () => void;
  onLike: () => void;
  onComment: () => void;
};

export default function VerseActionBar({ visible, onClear, onShare, onLike, onComment }: Props) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-x-0 z-50 pointer-events-none"
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
          <button
            onClick={onShare}
            className="inline-flex items-center rounded-full bg-foreground text-background px-5 py-2 text-base font-semibold shadow-lg hover:opacity-90"
          >
            Share
          </button>
          <button
            onClick={onLike}
            className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
          >
            ❤ Like
          </button>
          <button
            onClick={onComment}
            className="inline-flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-4 py-2 text-base shadow-md hover:bg-black/5 dark:hover:bg-white/10"
          >
            💬 Comment
          </button>
        </div>
      </div>
    </div>
  );
}


