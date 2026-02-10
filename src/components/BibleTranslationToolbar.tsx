import Link from "next/link";
import { BIBLE_TRANSLATION_OPTIONS } from "@/lib/bibleCanon";

type Props = {
  volume: string;
  book: string;
  chapter: string;
  translation: string;
  compare?: string;
};

export default function BibleTranslationToolbar({ volume, book, chapter, translation, compare }: Props) {
  const topOptions = BIBLE_TRANSLATION_OPTIONS.slice(0, 5);
  const compareOptions = BIBLE_TRANSLATION_OPTIONS.filter((option) => option.id !== translation).slice(0, 5);

  return (
    <div className="space-y-2 rounded-lg border border-black/10 dark:border-white/15 p-3">
      <div className="text-xs text-foreground/70">Bible source: bible-api.com</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground/70">Translation:</span>
        {topOptions.map((option) => (
          <Link
            key={option.id}
            href={`/browse/${volume}/${book}/${chapter}?translation=${option.id}${compare ? `&compare=${compare}` : ""}`}
            className={`rounded-md border px-2 py-1 text-xs ${
              translation === option.id
                ? "border-foreground/30 bg-foreground text-background"
                : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {option.id.toUpperCase()}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground/70">Compare:</span>
        <Link
          href={`/browse/${volume}/${book}/${chapter}?translation=${translation}`}
          className={`rounded-md border px-2 py-1 text-xs ${
            !compare
              ? "border-foreground/30 bg-foreground text-background"
              : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
          }`}
        >
          Off
        </Link>
        {compareOptions.map((option) => (
          <Link
            key={option.id}
            href={`/browse/${volume}/${book}/${chapter}?translation=${translation}&compare=${option.id}`}
            className={`rounded-md border px-2 py-1 text-xs ${
              compare === option.id
                ? "border-foreground/30 bg-foreground text-background"
                : "border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {option.id.toUpperCase()}
          </Link>
        ))}
      </div>
    </div>
  );
}
