import Link from "next/link";
import { formatJstSpans, type JstExcerpt } from "@/lib/jst";

/**
 * One Joseph Smith Translation appendix section that can't be read in place, shown whole above the chapter text:
 * the Book of Moses note, or a section with no KJV verses in this text to read it against. It keeps the source's
 * JST label and verse numbers and is not part of the verse text.
 */
export default function JstExcerptCard({ excerpt }: { excerpt: JstExcerpt }) {
  const mentionsMoses = !!excerpt.note && /book of moses/i.test(excerpt.note);
  return (
    <aside
      aria-label={`Joseph Smith Translation, ${excerpt.label.replace(/^JST,\s*/, "")}`}
      data-verse-ignore
      className="mt-2 rounded-md border border-[color:var(--surface-border)] border-l-4 border-l-[color:var(--accent-primary)] bg-[color:var(--surface-card)] px-3 py-2 text-sm leading-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-wide text-foreground/60">
        <span className="font-semibold text-foreground/80">{excerpt.label}</span>
        {excerpt.compareReference ? (
          <span>
            Compare {excerpt.compareReference}
            {excerpt.comparedSpans.length > 0 && excerpt.compareReference.split(",").length > 1 ? (
              <span className="sr-only"> (verses {formatJstSpans(excerpt.comparedSpans)} in this chapter)</span>
            ) : null}
          </span>
        ) : (
          <span>The source gives no matching KJV verse</span>
        )}
      </div>
      {excerpt.verses.length > 0 ? (
        <ol className="mt-1 space-y-1">
          {excerpt.verses.map((verse, index) => (
            <li key={`${verse.number}-${index}`}>
              {verse.number ? (
                <span className="mr-1.5 text-[11px] font-semibold text-foreground/55">
                  <span className="sr-only">JST verse </span>
                  {verse.number}
                </span>
              ) : null}
              {verse.text}
            </li>
          ))}
        </ol>
      ) : null}
      {excerpt.note ? (
        <p className="mt-1 text-foreground/75">
          {excerpt.note}
          {mentionsMoses ? (
            <>
              {" "}
              <Link href="/browse/pearl/moses/1" className="underline underline-offset-2">
                Read the Book of Moses
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </aside>
  );
}
