// The text of a Bible Dictionary, Guide to the Scriptures, or Topical Guide entry, as structured data the app
// renders itself (never as HTML). The server reads it from the official page (studyHelpContent.server.ts);
// these types and the preview rule are shared with the client.

import type { StudyHelpGuideId } from "./studyHelps";

/** Inline text: plain strings, emphasis, and links that were checked and resolved on the server. */
export type StudyHelpInline =
  | string
  | { mark: "em" | "strong" | "small" | "key"; children: StudyHelpInline[] }
  | {
      /** An absolute https://www.churchofjesuschrist.org URL. */
      href: string;
      /** Another entry of the same study helps, when its slug is a published topic. */
      topic?: { guide: StudyHelpGuideId; slug: string };
      /** The passage in this app's reader, for a scripture reference it can open. */
      appHref?: string;
      children: StudyHelpInline[];
    };

export type StudyHelpBlock =
  | { type: "heading"; content: StudyHelpInline[] }
  /** `title` paragraphs introduce what follows, such as a Topical Guide's "See also" list. */
  | { type: "paragraph"; style?: "title"; content: StudyHelpInline[] }
  | { type: "list"; items: StudyHelpInline[][] };

export type StudyHelpEntry = {
  guide: StudyHelpGuideId;
  slug: string;
  title: string;
  /** The official page, for reading it at its source. */
  url: string;
  blocks: StudyHelpBlock[];
  /** The entry was longer than the app keeps; the rest is at `url`. */
  truncated: boolean;
};

export function inlineText(content: StudyHelpInline[]): string {
  return content.map((node) => (typeof node === "string" ? node : inlineText(node.children))).join("");
}

function blockLength(block: StudyHelpBlock): number {
  return block.type === "list"
    ? block.items.reduce((sum, item) => sum + inlineText(item).length, 0)
    : inlineText(block.content).length;
}

/** A text prefix that preserves emphasis and links, without changing the full entry. */
function previewInline(content: StudyHelpInline[], maxChars: number): { content: StudyHelpInline[]; hasMore: boolean } {
  let remaining = Math.max(0, maxChars);
  let hasMore = false;
  const take = (nodes: StudyHelpInline[]): StudyHelpInline[] => {
    const kept: StudyHelpInline[] = [];
    for (const node of nodes) {
      if (remaining <= 0) {
        hasMore = true;
        break;
      }
      if (typeof node !== "string") {
        const children = take(node.children);
        if (children.length > 0) kept.push({ ...node, children });
      } else if (node.length <= remaining) {
        kept.push(node);
        remaining -= node.length;
      } else {
        let prefix = node.slice(0, remaining);
        const boundary = prefix.lastIndexOf(" ");
        if (boundary > prefix.length / 2) prefix = prefix.slice(0, boundary);
        // Do not split a supplementary Unicode character at the boundary.
        prefix = prefix.replace(/[\uD800-\uDBFF]$/, "").trimEnd();
        if (prefix) kept.push(prefix);
        remaining = 0;
        hasMore = true;
        break;
      }
    }
    return kept;
  };
  const kept = take(content);
  if (hasMore) kept.push("…");
  return { content: kept, hasMore };
}

/**
 * A compact opening before "Read more", preserving inline formatting and at most `maxListItems` list items.
 * A long See also line gets at most 120 characters, leaving room for the definition or scripture excerpts.
 */
export function previewStudyHelpBlocks(
  blocks: StudyHelpBlock[],
  { maxChars = 480, maxListItems = 3 }: { maxChars?: number; maxListItems?: number } = {}
): { blocks: StudyHelpBlock[]; hasMore: boolean } {
  const preview: StudyHelpBlock[] = [];
  let used = 0;
  let listItems = 0;
  let hasMore = false;
  for (const block of blocks) {
    if (used >= maxChars) return { blocks: preview, hasMore: true };
    if (block.type === "list") {
      const items: StudyHelpInline[][] = [];
      for (const item of block.items) {
        if (listItems >= maxListItems || used >= maxChars) break;
        const part = previewInline(item, maxChars - used);
        items.push(part.content);
        listItems += 1;
        used += inlineText(part.content).length;
        hasMore ||= part.hasMore;
      }
      if (items.length > 0) preview.push({ type: "list", items });
      if (items.length < block.items.length) return { blocks: preview, hasMore: true };
      continue;
    }
    const remaining = maxChars - used;
    const limit = block.type === "paragraph" && block.style === "title" ? Math.min(remaining, 120) : remaining;
    const part = blockLength(block) > limit ? previewInline(block.content, limit) : { content: block.content, hasMore: false };
    preview.push({ ...block, content: part.content });
    used += inlineText(part.content).length;
    hasMore ||= part.hasMore;
  }
  return { blocks: preview, hasMore };
}
