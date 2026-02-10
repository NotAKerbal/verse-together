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

const allowedInlineTags = new Set(["b", "strong", "i", "em", "u", "sup", "sub", "small", "br", "mark"]);

function sanitizeInlineHtml(value) {
  const parts = String(value ?? "").split(/(<\/?[^>]+>)/g);
  return parts
    .map((part) => {
      if (!part.startsWith("<")) return escapeHtml(part);
      const match = part.match(/^<\s*(\/?)\s*([a-z0-9]+)\s*\/?\s*>$/i);
      if (!match) return `<mark>${escapeHtml(part)}</mark>`;
      const isClosing = match[1] === "/";
      const name = match[2].toLowerCase();
      if (!allowedInlineTags.has(name)) return `<mark>${escapeHtml(part)}</mark>`;
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
