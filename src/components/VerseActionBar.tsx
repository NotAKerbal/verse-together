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
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 dark:border-white/15 bg-background/90 backdrop-blur px-3 py-2 sm:px-4">
      <div className="mx-auto max-w-3xl flex items-center gap-2 sm:gap-3">
        <button
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          className="inline-flex items-center justify-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
        >
          Clear
        </button>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            onClick={onShare}
            className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Share
          </button>
          <button
            onClick={onLike}
            className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            ❤ Like
          </button>
          <button
            onClick={onComment}
            className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            💬 Comment
          </button>
        </div>
      </div>
    </div>
  );
}


