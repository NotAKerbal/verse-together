// Pure Markdown heading detection for the notes editor, kept free of CodeMirror so it can be tested directly.

/** Valid ATX heading prefix: up to 3 spaces, 1-6 hashes, then a space or tab. */
export const HEADING_PREFIX = /^ {0,3}(#{1,6})[ \t]+/;

// A fence opener: up to 3 spaces, then 3+ backticks or tildes. Backtick info strings may not contain backticks.
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;

export type HeadingRange = {
  /** 1-based line number. */
  line: number;
  /** Offset of the line start in the document. */
  from: number;
  /** Offset just past the "## " prefix (hashes and following whitespace). */
  prefixEnd: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Every ATX heading in `text`, skipping lines inside fenced code blocks (``` or ~~~). Indented code
 * (4+ spaces) never matches because the prefix allows at most 3 leading spaces. Inline hashtags like
 * "#faith" are not headings: the hashes must be followed by a space or tab.
 */
export function headingRanges(text: string): HeadingRange[] {
  const ranges: HeadingRange[] = [];
  let fence: { char: string; length: number } | null = null;
  let offset = 0;
  const lines = text.split("\n");
  lines.forEach((raw, index) => {
    const lineText = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lineText);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
    } else {
      const open = FENCE_OPEN.exec(lineText);
      if (open) {
        fence = { char: open[1][0], length: open[1].length };
      } else {
        const match = HEADING_PREFIX.exec(lineText);
        if (match) {
          ranges.push({
            line: index + 1,
            from: offset,
            prefixEnd: offset + match[0].length,
            level: match[1].length as HeadingRange["level"],
          });
        }
      }
    }
    offset += raw.length + 1;
  });
  return ranges;
}
