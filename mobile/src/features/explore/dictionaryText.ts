// A dictionary entry's text (src/components/DictionaryEntryBody.tsx) for native views. The web's own normalizing
// and sanitizing pipeline runs unchanged, producing its small allowed-tag markup; that markup is then read into
// paragraphs, quotes and lists of styled runs, never interpreted as HTML. "See X" references and underlined terms
// become look-ups of that term, Bible targets become passages in the reader, and other links open in the browser.

const ALLOWED_INLINE_TAGS = new Set(["b", "strong", "i", "em", "u", "sup", "sub", "small", "br", "mark", "a", "span", "ol", "ul", "li"]);
const ALLOWED_SPAN_CLASS_NAMES = new Set(["dict-pos", "dict-col", "dict-cd", "dict-cite", "dict-see-etc"]);

const BIBLE_BOOKS = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth", "1samuel", "2samuel", "1kings", "2kings",
  "1chronicles", "2chronicles", "ezra", "nehemiah", "esther", "job", "psalms", "proverbs", "ecclesiastes", "songofsolomon", "isaiah",
  "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk",
  "zephaniah", "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts", "romans", "1corinthians", "2corinthians", "galatians", "ephesians", "philippians",
  "colossians", "1thessalonians", "2thessalonians", "1timothy", "2timothy", "titus", "philemon", "hebrews", "james", "1peter", "2peter",
  "1john", "2john", "3john", "jude", "revelation",
];

function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrText)) !== null) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function isCitationLine(text: string): boolean {
  const line = text.trim();
  if (!line || line.length < 3 || line.length > 120) return false;
  if (/^[-–—]\s*[A-Z0-9]/.test(line)) return true;
  if (/^[A-Z][A-Za-z0-9'.,;&\-\s]+\.$/.test(line)) return true;
  return false;
}

function decorateCitationLines(input: string): string {
  return input
    .split("\n")
    .map((rawLine) => {
      const plain = decodeEntities(rawLine.replace(/<[^>]*>/g, "")).trim();
      if (!isCitationLine(plain)) return rawLine;
      return `<span class="dict-cite">${rawLine.trim()}</span>`;
    })
    .join("\n");
}

function linkSeeReferences(input: string): string {
  return input.replace(/\bSee\s+([A-Z][A-Za-z' -]*(?:\s*,\s*[A-Z][A-Za-z' -]*)*)(\s*,?\s*etc\.)?/g, (full, refs: string, etcPart?: string) => {
    const terms = String(refs)
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length === 0) return full;
    const linked = terms.map((term) => `<a href="#" class="dict-see-ref" data-dict-term="${escapeHtml(term)}">${escapeHtml(term)}</a>`).join(", ");
    return `See ${linked}${etcPart ? escapeHtml(String(etcPart)) : ""}`;
  });
}

function linkUnderlinedTerms(input: string): string {
  return input.replace(/<u>([^<]+)<\/u>/gi, (_full, term: string) => {
    const clean = decodeEntities(String(term || "")).trim();
    if (!clean) return "";
    const safe = escapeHtml(clean);
    return `<a href="#" class="dict-see-ref" data-dict-term="${safe}">${safe}</a>`;
  });
}

/** A Bible target ("40005003": book 40, chapter 5, verse 3) as the reader's path. */
export function decodeBibleTargetToHref(target: string): string | null {
  const digits = String(target || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const bookNumber = Number(digits.slice(0, -6));
  const chapter = Number(digits.slice(-6, -3));
  const verse = Number(digits.slice(-3));
  if (bookNumber < 1 || bookNumber > 66 || chapter < 1 || verse < 1) return null;
  const book = BIBLE_BOOKS[bookNumber - 1];
  return `/browse/${bookNumber <= 39 ? "oldtestament" : "newtestament"}/${book}/${chapter}#v-${verse}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function decodeEntities(value: string): string {
  return value.replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

function normalizeSourceMarkup(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\[uCode:[^\]\s,;)]*[\]\.]?/gi, (token) => `<mark>${escapeHtml(token)}</mark>`)
    .replace(/<span\b[^>]*class=["']term["'][^>]*>([\s\S]*?)<\/span>/gi, "<strong>$1</strong>")
    .replace(/<\s*pos\b[^>]*>/gi, '<span class="dict-pos">')
    .replace(/<\s*\/\s*pos\s*>/gi, "</span>")
    .replace(/<\s*col\b[^>]*>/gi, '<span class="dict-col">')
    .replace(/<\s*\/\s*col\s*>/gi, "</span>")
    .replace(/<\s*cd\b[^>]*>/gi, '<span class="dict-cd">')
    .replace(/<\s*\/\s*cd\s*>/gi, "</span>")
    .replace(/<\s*sd\b[^>]*>/gi, '<span class="dict-sd">')
    .replace(/<\s*\/\s*sd\s*>/gi, "</span>")
    .replace(/<\/?(?:div|p)\b[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, (tag) => {
      const match = tag.match(/^<\s*\/?\s*([a-z0-9]+)\b/i);
      if (!match) return `<mark>${escapeHtml(tag)}</mark>`;
      const name = match[1].toLowerCase();
      if (!ALLOWED_INLINE_TAGS.has(name) && name !== "blockquote") return `<mark>${escapeHtml(tag)}</mark>`;
      if (name === "blockquote") return tag.includes("/") ? "\n\n</blockquote>\n\n" : "\n\n<blockquote>\n";
      if (name === "ol" || name === "ul") {
        if (tag.includes("/")) return `</${name}>`;
        const className = (parseAttributes(tag)["class"] || "").toLowerCase();
        if (name === "ol" && /\bnumbers\b/.test(className)) return '<ol class="dict-ol dict-ol-numbers">';
        return name === "ol" ? '<ol class="dict-ol">' : '<ul class="dict-ul">';
      }
      if (name === "li") return tag.includes("/") ? "</li>" : "<li>";
      if (name === "a") return tag;
      if (name === "br") return "<br>";
      return tag.includes("/") ? `</${name}>` : `<${name}>`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeInlineHtml(value: string): string {
  const chunks = value.split(/(<\/?[^>]+>)/g);
  let openLinkDepth = 0;
  return chunks
    .map((chunk) => {
      if (!chunk.startsWith("<")) return escapeHtml(chunk);
      const match = chunk.match(/^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)\/?\s*>$/i);
      if (!match) return `<mark>${escapeHtml(chunk)}</mark>`;
      const closing = match[1] === "/";
      const name = match[2].toLowerCase();
      const attrText = match[3] ?? "";
      if (!ALLOWED_INLINE_TAGS.has(name)) return `<mark>${escapeHtml(chunk)}</mark>`;
      if (name === "ol" || name === "ul") {
        if (closing) return `</${name}>`;
        const className = String(parseAttributes(attrText)["class"] || "").trim().toLowerCase();
        if (["dict-ol", "dict-ol-numbers", "dict-ul"].includes(className)) return `<${name} class="${className}">`;
        return name === "ol" ? '<ol class="dict-ol">' : '<ul class="dict-ul">';
      }
      if (name === "li") return closing ? "</li>" : "<li>";
      if (name === "span") {
        if (closing) return "</span>";
        const className = (parseAttributes(attrText)["class"] || "").trim().toLowerCase();
        if (ALLOWED_SPAN_CLASS_NAMES.has(className) || className === "dict-sd") return `<span class="${className}">`;
        return "<span>";
      }
      if (name === "a") {
        if (closing) {
          if (openLinkDepth > 0) {
            openLinkDepth -= 1;
            return `<span class="dict-link-icon">↗</span></a>`;
          }
          return "</a>";
        }
        const attrs = parseAttributes(attrText);
        const className = attrs["class"] || "";
        const term = attrs["data-dict-term"] || "";
        if (/\bdict-see-ref\b/i.test(className) && term.trim().length > 0) return `<a href="#" class="dict-see-ref" data-dict-term="${escapeHtml(term)}">`;
        const isBibleLink = /\bbible\b/i.test(className) || !!attrs["target"];
        const href = (isBibleLink ? decodeBibleTargetToHref(attrs["target"] || "") : null) || attrs["href"] || "";
        if (!href || /^(javascript|data):/i.test(href)) return `<mark>${escapeHtml(chunk)}</mark>`;
        openLinkDepth += 1;
        return `<a href="${escapeHtml(href)}" class="${isBibleLink ? "dict-link-chip dict-bible-link" : "dict-link-chip"}">`;
      }
      if (name === "br") return "<br>";
      return closing ? `</${name}>` : `<${name}>`;
    })
    .join("");
}

/** The web's sanitized markup for an entry (formatDictionaryRichText): only the allowed tags, text escaped. */
export function formatDictionaryMarkup(rawText: string): string {
  const normalized = normalizeSourceMarkup(linkUnderlinedTerms(decodeEntities(rawText)));
  if (!normalized) return "";
  const blocks: Array<{ type: "text" | "blockquote" | "list"; content: string }> = [];
  const structuralBlockRe = /<(blockquote|ol|ul)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = structuralBlockRe.exec(normalized)) !== null) {
    const before = normalized.slice(cursor, match.index);
    if (before.trim()) blocks.push({ type: "text", content: before });
    blocks.push({ type: (match[1] || "").toLowerCase() === "blockquote" ? "blockquote" : "list", content: match[0] ?? "" });
    cursor = structuralBlockRe.lastIndex;
  }
  const tail = normalized.slice(cursor);
  if (tail.trim()) blocks.push({ type: "text", content: tail });

  const html: string[] = [];
  for (const block of blocks) {
    if (block.type === "blockquote") {
      const inner = block.content.replace(/^<blockquote\b[^>]*>/i, "").replace(/<\/blockquote>$/i, "").trim();
      if (inner) html.push(`<blockquote>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(inner)).replace(/\n+/g, "<br>"))}</blockquote>`);
      continue;
    }
    if (block.type === "list") {
      html.push(sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(block.content)).replace(/\n+/g, "<br>")));
      continue;
    }
    for (const paragraph of block.content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
      html.push(`<p>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(paragraph)).replace(/\n+/g, "<br>"))}</p>`);
    }
  }
  return html.join("");
}

// ---- The sanitized markup as native structure ----

export type DictStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  small?: boolean;
  sup?: boolean;
  sub?: boolean;
  mark?: boolean;
  /** The web's .dict-pos (part of speech), .dict-col, .dict-cd, .dict-cite and .dict-sd. */
  role?: "pos" | "col" | "cd" | "cite" | "sd" | "icon";
  /** Another term to look up ("See Faith"). */
  seeTerm?: string;
  /** A link: an app path for a Bible passage, or a web URL. */
  href?: string;
  bible?: boolean;
};
export type DictRun = DictStyle & { text: string };
export type DictBlock = { kind: "p"; runs: DictRun[] } | { kind: "quote"; runs: DictRun[] } | { kind: "list"; ordered: boolean; items: DictRun[][] };

/** Reads the sanitized markup (and only it: formatDictionaryMarkup's output) into blocks of styled runs. */
export function parseDictionaryMarkup(markup: string): DictBlock[] {
  const blocks: DictBlock[] = [];
  const styles: Array<{ tag: string; style: DictStyle }> = [];
  let runs: DictRun[] | null = null;
  let list: Extract<DictBlock, { kind: "list" }> | null = null;
  let listDepth = 0;

  const current = (): DictStyle => Object.assign({}, ...styles.map((entry) => entry.style));
  const push = (text: string) => {
    if (!text) return;
    if (!runs) {
      // Text outside any block (between a list's items, say) still shows, in a paragraph of its own.
      if (list && listDepth > 0) {
        runs = [];
        list.items.push(runs);
      } else {
        runs = [];
        blocks.push({ kind: "p", runs });
      }
    }
    const style = current();
    const last = runs[runs.length - 1];
    if (last && JSON.stringify({ ...last, text: "" }) === JSON.stringify({ ...style, text: "" })) last.text += text;
    else runs.push({ ...style, text });
  };

  for (const chunk of markup.split(/(<\/?[^>]+>)/g)) {
    if (!chunk) continue;
    if (!chunk.startsWith("<")) {
      push(decodeEntities(chunk));
      continue;
    }
    const match = chunk.match(/^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)>$/i);
    if (!match) continue;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attrs = closing ? {} : parseAttributes(match[3] ?? "");
    switch (name) {
      case "p":
      case "blockquote":
        if (closing) runs = null;
        else {
          runs = [];
          blocks.push({ kind: name === "p" ? "p" : "quote", runs });
        }
        break;
      case "ol":
      case "ul":
        if (closing) {
          listDepth = Math.max(0, listDepth - 1);
          if (listDepth === 0) {
            list = null;
            runs = null;
          }
        } else {
          listDepth += 1;
          if (listDepth === 1) {
            list = { kind: "list", ordered: name === "ol", items: [] };
            blocks.push(list);
            runs = null;
          }
        }
        break;
      case "li":
        if (!closing && list) {
          // A nested list's item continues in its parent item, on a new line.
          if (listDepth > 1 && runs) push("\n");
          else {
            runs = [];
            list.items.push(runs);
          }
        } else if (closing && listDepth <= 1) runs = null;
        break;
      case "br":
        push("\n");
        break;
      default: {
        if (closing) {
          for (let index = styles.length - 1; index >= 0; index--) {
            if (styles[index].tag === name) {
              styles.splice(index, 1);
              break;
            }
          }
          break;
        }
        const style: DictStyle =
          name === "b" || name === "strong" ? { bold: true }
          : name === "i" || name === "em" ? { italic: true }
          : name === "u" ? { underline: true }
          : name === "small" ? { small: true }
          : name === "sup" ? { sup: true }
          : name === "sub" ? { sub: true }
          : name === "mark" ? { mark: true }
          : name === "span" ? spanStyle(attrs["class"])
          : name === "a" ? linkStyle(attrs)
          : {};
        styles.push({ tag: name, style });
      }
    }
  }
  return blocks
    .map((block) => (block.kind === "list" ? { ...block, items: block.items.map(trimRuns).filter((item) => item.length) } : { ...block, runs: trimRuns(block.runs) }))
    .filter((block) => (block.kind === "list" ? block.items.length > 0 : block.runs.length > 0));
}

function spanStyle(className = ""): DictStyle {
  const role = className.replace(/^dict-/, "");
  if (role === "pos" || role === "col" || role === "cd" || role === "cite" || role === "sd") return { role };
  if (role === "link-icon") return { role: "icon" };
  return {};
}

function linkStyle(attrs: Record<string, string>): DictStyle {
  if (/\bdict-see-ref\b/.test(attrs["class"] ?? "") && attrs["data-dict-term"]) return { seeTerm: attrs["data-dict-term"] };
  const href = attrs["href"];
  if (!href || href === "#") return {};
  return { href, bible: /\bdict-bible-link\b/.test(attrs["class"] ?? "") };
}

function trimRuns(runs: DictRun[]): DictRun[] {
  const out = runs.map((run) => ({ ...run }));
  while (out.length && !out[0].text.trim()) out.shift();
  while (out.length && !out[out.length - 1].text.trim()) out.pop();
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, "");
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
  }
  return out;
}

/** An entry's blocks, ready to render. */
export function dictionaryBlocks(entryText: string): DictBlock[] {
  return parseDictionaryMarkup(formatDictionaryMarkup(entryText));
}

/** An entry as plain text, for a journal entry: paragraphs, quotes as "> ", and list items numbered or bulleted. */
export function dictionaryPlainText(entryText: string): string {
  const text = (runs: DictRun[]) => runs.filter((run) => run.role !== "icon").map((run) => run.text).join("");
  return dictionaryBlocks(entryText)
    .map((block) => {
      if (block.kind === "list") return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${text(item)}`).join("\n");
      if (block.kind === "quote") return text(block.runs).split("\n").map((line) => `> ${line}`).join("\n");
      return text(block.runs);
    })
    .join("\n\n")
    .trim();
}
