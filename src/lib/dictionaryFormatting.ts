type DictionaryPresentation = "web" | "native";

const ALLOWED_INLINE_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "sup",
  "sub",
  "small",
  "br",
  "mark",
  "a",
  "span",
  "ol",
  "ul",
  "li",
]);
const ALLOWED_SPAN_CLASS_NAMES = new Set(["dict-pos", "dict-col", "dict-cd", "dict-cite", "dict-see-etc"]);

const BIBLE_BOOKS_BY_NUMBER: Array<{ volume: "oldtestament" | "newtestament"; book: string } | null> = [
  null,
  { volume: "oldtestament", book: "genesis" },
  { volume: "oldtestament", book: "exodus" },
  { volume: "oldtestament", book: "leviticus" },
  { volume: "oldtestament", book: "numbers" },
  { volume: "oldtestament", book: "deuteronomy" },
  { volume: "oldtestament", book: "joshua" },
  { volume: "oldtestament", book: "judges" },
  { volume: "oldtestament", book: "ruth" },
  { volume: "oldtestament", book: "1samuel" },
  { volume: "oldtestament", book: "2samuel" },
  { volume: "oldtestament", book: "1kings" },
  { volume: "oldtestament", book: "2kings" },
  { volume: "oldtestament", book: "1chronicles" },
  { volume: "oldtestament", book: "2chronicles" },
  { volume: "oldtestament", book: "ezra" },
  { volume: "oldtestament", book: "nehemiah" },
  { volume: "oldtestament", book: "esther" },
  { volume: "oldtestament", book: "job" },
  { volume: "oldtestament", book: "psalms" },
  { volume: "oldtestament", book: "proverbs" },
  { volume: "oldtestament", book: "ecclesiastes" },
  { volume: "oldtestament", book: "songofsolomon" },
  { volume: "oldtestament", book: "isaiah" },
  { volume: "oldtestament", book: "jeremiah" },
  { volume: "oldtestament", book: "lamentations" },
  { volume: "oldtestament", book: "ezekiel" },
  { volume: "oldtestament", book: "daniel" },
  { volume: "oldtestament", book: "hosea" },
  { volume: "oldtestament", book: "joel" },
  { volume: "oldtestament", book: "amos" },
  { volume: "oldtestament", book: "obadiah" },
  { volume: "oldtestament", book: "jonah" },
  { volume: "oldtestament", book: "micah" },
  { volume: "oldtestament", book: "nahum" },
  { volume: "oldtestament", book: "habakkuk" },
  { volume: "oldtestament", book: "zephaniah" },
  { volume: "oldtestament", book: "haggai" },
  { volume: "oldtestament", book: "zechariah" },
  { volume: "oldtestament", book: "malachi" },
  { volume: "newtestament", book: "matthew" },
  { volume: "newtestament", book: "mark" },
  { volume: "newtestament", book: "luke" },
  { volume: "newtestament", book: "john" },
  { volume: "newtestament", book: "acts" },
  { volume: "newtestament", book: "romans" },
  { volume: "newtestament", book: "1corinthians" },
  { volume: "newtestament", book: "2corinthians" },
  { volume: "newtestament", book: "galatians" },
  { volume: "newtestament", book: "ephesians" },
  { volume: "newtestament", book: "philippians" },
  { volume: "newtestament", book: "colossians" },
  { volume: "newtestament", book: "1thessalonians" },
  { volume: "newtestament", book: "2thessalonians" },
  { volume: "newtestament", book: "1timothy" },
  { volume: "newtestament", book: "2timothy" },
  { volume: "newtestament", book: "titus" },
  { volume: "newtestament", book: "philemon" },
  { volume: "newtestament", book: "hebrews" },
  { volume: "newtestament", book: "james" },
  { volume: "newtestament", book: "1peter" },
  { volume: "newtestament", book: "2peter" },
  { volume: "newtestament", book: "1john" },
  { volume: "newtestament", book: "2john" },
  { volume: "newtestament", book: "3john" },
  { volume: "newtestament", book: "jude" },
  { volume: "newtestament", book: "revelation" },
];

export function parseDictionaryAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrText)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeDictionaryEntities(value);
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
      const plain = decodeDictionaryEntities(rawLine.replace(/<[^>]*>/g, "")).trim();
      if (!isCitationLine(plain)) return rawLine;
      return `<span class="dict-cite">${rawLine.trim()}</span>`;
    })
    .join("\n");
}

function linkSeeReferences(input: string): string {
  return input.replace(
    /\bSee\s+([A-Z][A-Za-z' -]*(?:\s*,\s*[A-Z][A-Za-z' -]*)*)(\s*,?\s*etc\.)?/g,
    (_full, refs: string, etcPart?: string) => {
      const terms = String(refs)
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean);
      if (terms.length === 0) return _full;
      const linkedTerms = terms
        .map((term) => {
          const safeTerm = escapeHtml(term);
          return `<a href="#" class="dict-see-ref" data-dict-term="${safeTerm}">${safeTerm}</a>`;
        })
        .join(", ");
      const suffix = etcPart ? escapeHtml(String(etcPart)) : "";
      return `See ${linkedTerms}${suffix}`;
    }
  );
}

function linkUnderlinedTerms(input: string): string {
  return input.replace(/<u>([^<]+)<\/u>/gi, (_full, term: string) => {
    const cleanTerm = decodeDictionaryEntities(String(term || "")).trim();
    if (!cleanTerm) return "";
    const safeTerm = escapeHtml(cleanTerm);
    return `<a href="#" class="dict-see-ref" data-dict-term="${safeTerm}">${safeTerm}</a>`;
  });
}

export function decodeBibleTargetToHref(target: string): string | null {
  const digits = String(target || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const bookNumber = Number(digits.slice(0, -6));
  const chapter = Number(digits.slice(-6, -3));
  const verse = Number(digits.slice(-3));
  if (!Number.isFinite(bookNumber) || !Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  if (bookNumber < 1 || bookNumber > 66 || chapter < 1 || verse < 1) return null;
  const bookInfo = BIBLE_BOOKS_BY_NUMBER[bookNumber];
  if (!bookInfo) return null;
  return `/browse/${bookInfo.volume}/${bookInfo.book}/${chapter}#v-${verse}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function decodeDictionaryEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
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
      if (name === "blockquote") {
        return tag.includes("/") ? "\n\n</blockquote>\n\n" : "\n\n<blockquote>\n";
      }
      if (name === "ol" || name === "ul") {
        if (tag.includes("/")) return `</${name}>`;
        const attrs = parseDictionaryAttributes(tag);
        const className = (attrs["class"] || "").toLowerCase();
        if (name === "ol" && /\bnumbers\b/.test(className)) {
          return '<ol class="dict-ol dict-ol-numbers">';
        }
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

function sanitizeInlineHtml(value: string, presentation: DictionaryPresentation): string {
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
        const attrs = parseDictionaryAttributes(attrText);
        const className = String(attrs["class"] || "").trim().toLowerCase();
        const allowedClassNames = new Set(["dict-ol", "dict-ol-numbers", "dict-ul"]);
        if (allowedClassNames.has(className)) {
          return `<${name} class="${className}">`;
        }
        return name === "ol" ? '<ol class="dict-ol">' : '<ul class="dict-ul">';
      }
      if (name === "li") {
        return closing ? "</li>" : "<li>";
      }
      if (name === "span") {
        if (closing) return "</span>";
        const attrs = parseDictionaryAttributes(attrText);
        const rawClassName = attrs["class"] || "";
        const normalizedClassName = rawClassName.trim().toLowerCase();
        if (ALLOWED_SPAN_CLASS_NAMES.has(normalizedClassName) || normalizedClassName === "dict-sd") {
          return `<span class="${normalizedClassName}">`;
        }
        return "<span>";
      }
      if (name === "a") {
        if (closing) {
          if (openLinkDepth > 0) {
            openLinkDepth -= 1;
            return `<span class="dict-link-icon"${presentation === "web" ? ' aria-hidden="true"' : ""}>↗</span></a>`;
          }
          return "</a>";
        }
        const attrs = parseDictionaryAttributes(attrText);
        const className = attrs["class"] || "";
        const dataDictTerm = attrs["data-dict-term"] || "";
        const isSeeRef = /\bdict-see-ref\b/i.test(className) && dataDictTerm.trim().length > 0;
        if (isSeeRef) {
          return `<a href="#" class="dict-see-ref" data-dict-term="${escapeHtml(dataDictTerm)}">`;
        }
        const isBibleLink = /\bbible\b/i.test(className) || !!attrs["target"];
        const resolvedHref = isBibleLink ? decodeBibleTargetToHref(attrs["target"] || "") : null;
        const href = resolvedHref || attrs["href"] || "";
        if (!href || /^(javascript|data):/i.test(href)) {
          return `<mark>${escapeHtml(chunk)}</mark>`;
        }
        openLinkDepth += 1;
        const chipClass = isBibleLink ? "dict-link-chip dict-bible-link" : "dict-link-chip";
        return `<a href="${escapeHtml(href)}" class="${chipClass}"${presentation === "web" ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
      }
      if (name === "br") return "<br>";
      return closing ? `</${name}>` : `<${name}>`;
    })
    .join("");
}

export function formatDictionaryMarkup(rawText: string, presentation: DictionaryPresentation = "web"): string {
  const normalized = normalizeSourceMarkup(linkUnderlinedTerms(decodeDictionaryEntities(rawText)));
  if (!normalized) return "";

  const blocks: Array<{ type: "text" | "blockquote" | "list"; content: string }> = [];
  const structuralBlockRe = /<(blockquote|ol|ul)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = structuralBlockRe.exec(normalized)) !== null) {
    const before = normalized.slice(cursor, match.index);
    if (before.trim()) {
      blocks.push({ type: "text", content: before });
    }
    const blockType = (match[1] || "").toLowerCase();
    if (blockType === "blockquote") {
      blocks.push({ type: "blockquote", content: match[0] ?? "" });
    } else {
      blocks.push({ type: "list", content: match[0] ?? "" });
    }
    cursor = structuralBlockRe.lastIndex;
  }
  const tail = normalized.slice(cursor);
  if (tail.trim()) {
    blocks.push({ type: "text", content: tail });
  }

  const html: string[] = [];

  for (const block of blocks) {
    if (block.type === "blockquote") {
      const inner = block.content
        .replace(/^<blockquote\b[^>]*>/i, "")
        .replace(/<\/blockquote>$/i, "")
        .trim();
      if (inner.length > 0) {
        html.push(`<blockquote${presentation === "web" ? ' class="border-l-2 border-foreground/20 pl-3 italic"' : ""}>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(inner)).replace(/\n+/g, "<br>"), presentation)}</blockquote>`);
      }
      continue;
    }
    if (block.type === "list") {
      html.push(sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(block.content)).replace(/\n+/g, "<br>"), presentation));
      continue;
    }
    const textParagraphs = block.content
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const paragraph of textParagraphs) {
      html.push(`<p>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(paragraph)).replace(/\n+/g, "<br>"), presentation)}</p>`);
    }
  }

  return html.join("");
}
