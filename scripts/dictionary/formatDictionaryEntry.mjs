function decodeEntities(value) {
  return String(value ?? "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const allowedInlineTags = new Set([
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
const allowedSpanClassNames = new Set(["dict-pos", "dict-col", "dict-cd", "dict-cite", "dict-see-etc", "dict-sd"]);

const bibleBooksByNumber = [
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

function parseAttributes(attrText) {
  const attrs = {};
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = attrRe.exec(attrText)) !== null) {
    const key = String(match[1] || "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeEntities(value);
  }
  return attrs;
}

function isCitationLine(text) {
  const line = String(text || "").trim();
  if (!line || line.length < 3 || line.length > 120) return false;
  if (/^[-–—]\s*[A-Z0-9]/.test(line)) return true;
  if (/^[A-Z][A-Za-z0-9'.,;&\-\s]+\.$/.test(line)) return true;
  return false;
}

function decorateCitationLines(input) {
  return String(input ?? "")
    .split("\n")
    .map((rawLine) => {
      const plain = decodeEntities(rawLine.replace(/<[^>]*>/g, "")).trim();
      if (!isCitationLine(plain)) return rawLine;
      return `<span class="dict-cite">${rawLine.trim()}</span>`;
    })
    .join("\n");
}

function linkSeeReferences(input) {
  return String(input ?? "").replace(
    /\bSee\s+([A-Z][A-Za-z' -]*(?:\s*,\s*[A-Z][A-Za-z' -]*)*)(\s*,?\s*etc\.)?/g,
    (_full, refs, etcPart) => {
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

function linkUnderlinedTerms(input) {
  return String(input ?? "").replace(/<u>([^<]+)<\/u>/gi, (_full, term) => {
    const cleanTerm = decodeEntities(String(term || "")).trim();
    if (!cleanTerm) return "";
    const safeTerm = escapeHtml(cleanTerm);
    return `<a href="#" class="dict-see-ref" data-dict-term="${safeTerm}">${safeTerm}</a>`;
  });
}

function decodeBibleTargetToHref(target) {
  const digits = String(target || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const bookNumber = Number(digits.slice(0, -6));
  const chapter = Number(digits.slice(-6, -3));
  const verse = Number(digits.slice(-3));
  if (!Number.isFinite(bookNumber) || !Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  if (bookNumber < 1 || bookNumber > 66 || chapter < 1 || verse < 1) return null;
  const bookInfo = bibleBooksByNumber[bookNumber];
  if (!bookInfo) return null;
  return `/browse/${bookInfo.volume}/${bookInfo.book}/${chapter}#v-${verse}`;
}

function sanitizeInlineHtml(value) {
  const parts = String(value ?? "").split(/(<\/?[^>]+>)/g);
  let openLinkDepth = 0;
  return parts
    .map((part) => {
      if (!part.startsWith("<")) return escapeHtml(part);
      const match = part.match(/^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)\/?\s*>$/i);
      if (!match) return `<mark>${escapeHtml(part)}</mark>`;
      const isClosing = match[1] === "/";
      const name = match[2].toLowerCase();
      const attrText = match[3] ?? "";
      if (!allowedInlineTags.has(name)) return `<mark>${escapeHtml(part)}</mark>`;
      if (name === "ol" || name === "ul") {
        if (isClosing) return `</${name}>`;
        const attrs = parseAttributes(attrText);
        const className = String(attrs.class || "").trim().toLowerCase();
        const allowedClassNames = new Set(["dict-ol", "dict-ol-numbers", "dict-ul"]);
        if (allowedClassNames.has(className)) {
          return `<${name} class="${className}">`;
        }
        return name === "ol" ? '<ol class="dict-ol">' : '<ul class="dict-ul">';
      }
      if (name === "li") {
        return isClosing ? "</li>" : "<li>";
      }
      if (name === "span") {
        if (isClosing) return "</span>";
        const attrs = parseAttributes(attrText);
        const rawClassName = attrs.class || "";
        const normalizedClassName = String(rawClassName).trim().toLowerCase();
        if (allowedSpanClassNames.has(normalizedClassName)) {
          return `<span class="${normalizedClassName}">`;
        }
        return "<span>";
      }
      if (name === "a") {
        if (isClosing) {
          if (openLinkDepth > 0) {
            openLinkDepth -= 1;
            return `<span class="dict-link-icon" aria-hidden="true">↗</span></a>`;
          }
          return "</a>";
        }
        const attrs = parseAttributes(attrText);
        const className = attrs.class || "";
        const dataDictTerm = attrs["data-dict-term"] || "";
        const isSeeRef = /\bdict-see-ref\b/i.test(className) && String(dataDictTerm).trim().length > 0;
        if (isSeeRef) {
          return `<a href="#" class="dict-see-ref" data-dict-term="${escapeHtml(dataDictTerm)}">`;
        }
        const isBibleLink = /\bbible\b/i.test(className) || !!attrs.target;
        const resolvedHref = isBibleLink ? decodeBibleTargetToHref(attrs.target || "") : null;
        const href = resolvedHref || attrs.href || "";
        if (!href || /^(javascript|data):/i.test(href)) {
          return `<mark>${escapeHtml(part)}</mark>`;
        }
        openLinkDepth += 1;
        const chipClass = isBibleLink ? "dict-link-chip dict-bible-link" : "dict-link-chip";
        return `<a href="${escapeHtml(href)}" class="${chipClass}" target="_blank" rel="noopener noreferrer">`;
      }
      if (name === "br") return "<br>";
      return isClosing ? `</${name}>` : `<${name}>`;
    })
    .join("");
}

function normalizeSourceMarkup(input) {
  return String(input ?? "")
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
      if (!allowedInlineTags.has(name) && name !== "blockquote") return `<mark>${escapeHtml(tag)}</mark>`;
      if (name === "blockquote") {
        return tag.includes("/") ? "\n\n</blockquote>\n\n" : "\n\n<blockquote>\n";
      }
      if (name === "ol" || name === "ul") {
        if (tag.includes("/")) return `</${name}>`;
        const attrs = parseAttributes(tag);
        const className = String(attrs.class || "").toLowerCase();
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

export function formatDictionaryEntryRichText(rawText) {
  const normalized = normalizeSourceMarkup(linkUnderlinedTerms(decodeEntities(rawText)));
  if (!normalized) return "";
  const blocks = [];
  const structuralBlockRe = /<(blockquote|ol|ul)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let cursor = 0;
  let match;
  while ((match = structuralBlockRe.exec(normalized)) !== null) {
    const before = normalized.slice(cursor, match.index);
    if (before.trim()) {
      blocks.push({ type: "text", content: before });
    }
    const blockType = String(match[1] || "").toLowerCase();
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

  const htmlBlocks = [];
  for (const block of blocks) {
    if (block.type === "blockquote") {
      const inner = String(block.content ?? "")
        .replace(/^<blockquote\b[^>]*>/i, "")
        .replace(/<\/blockquote>$/i, "")
        .trim();
      if (inner.length > 0) {
        htmlBlocks.push(`<blockquote>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(inner)).replace(/\n+/g, "<br>"))}</blockquote>`);
      }
      continue;
    }
    if (block.type === "list") {
      htmlBlocks.push(sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(String(block.content ?? ""))).replace(/\n+/g, "<br>")));
      continue;
    }
    const textParagraphs = String(block.content ?? "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const paragraph of textParagraphs) {
      htmlBlocks.push(`<p>${sanitizeInlineHtml(linkSeeReferences(decorateCitationLines(paragraph)).replace(/\n+/g, "<br>"))}</p>`);
    }
  }
  return htmlBlocks.join("");
}
