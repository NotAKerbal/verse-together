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

const allowedInlineTags = new Set(["b", "strong", "i", "em", "u", "sup", "sub", "small", "br", "mark", "a"]);

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
    .replace(/\[uCode:[^\]]*]/gi, (token) => `<mark>${escapeHtml(token)}</mark>`)
    .replace(/<span\b[^>]*class=["']term["'][^>]*>([\s\S]*?)<\/span>/gi, "<strong>$1</strong>")
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
      if (name === "a") return tag;
      if (name === "br") return "<br>";
      return tag.includes("/") ? `</${name}>` : `<${name}>`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatDictionaryEntryRichText(rawText) {
  const normalized = normalizeSourceMarkup(decodeEntities(rawText));
  if (!normalized) return "";
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const htmlBlocks = [];
  for (const block of blocks) {
    if (block.startsWith("<blockquote>") && block.endsWith("</blockquote>")) {
      const inner = block.slice("<blockquote>".length, -"</blockquote>".length).trim();
      if (inner) {
        htmlBlocks.push(`<blockquote>${sanitizeInlineHtml(inner.replace(/\n+/g, "<br>"))}</blockquote>`);
      }
      continue;
    }
    htmlBlocks.push(`<p>${sanitizeInlineHtml(block.replace(/\n+/g, "<br>"))}</p>`);
  }
  return htmlBlocks.join("");
}
