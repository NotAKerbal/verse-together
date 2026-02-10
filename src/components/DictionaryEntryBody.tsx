"use client";

const ALLOWED_INLINE_TAGS = new Set(["b", "strong", "i", "em", "u", "sup", "sub", "small", "br", "mark"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeEntities(value: string): string {
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
    .replace(/\[uCode:[^\]]*]/gi, (token) => `<mark>${escapeHtml(token)}</mark>`)
    .replace(/<span\b[^>]*class=["']term["'][^>]*>([\s\S]*?)<\/span>/gi, "<strong>$1</strong>")
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
      if (name === "br") return "<br>";
      return tag.includes("/") ? `</${name}>` : `<${name}>`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeInlineHtml(value: string): string {
  const chunks = value.split(/(<\/?[^>]+>)/g);
  return chunks
    .map((chunk) => {
      if (!chunk.startsWith("<")) return escapeHtml(chunk);
      const match = chunk.match(/^<\s*(\/?)\s*([a-z0-9]+)\s*\/?\s*>$/i);
      if (!match) return `<mark>${escapeHtml(chunk)}</mark>`;
      const closing = match[1] === "/";
      const name = match[2].toLowerCase();
      if (!ALLOWED_INLINE_TAGS.has(name)) return `<mark>${escapeHtml(chunk)}</mark>`;
      if (name === "br") return "<br>";
      return closing ? `</${name}>` : `<${name}>`;
    })
    .join("");
}

function formatDictionaryRichText(rawText: string): string {
  const normalized = normalizeSourceMarkup(decodeEntities(rawText));
  if (!normalized) return "";

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const html: string[] = [];

  for (const block of blocks) {
    if (block.startsWith("<blockquote>") && block.endsWith("</blockquote>")) {
      const inner = block.slice("<blockquote>".length, -"</blockquote>".length).trim();
      if (inner) {
        html.push(
          `<blockquote class="border-l-2 border-foreground/20 pl-3 italic">${sanitizeInlineHtml(inner.replace(/\n+/g, "<br>"))}</blockquote>`
        );
      }
      continue;
    }
    html.push(`<p>${sanitizeInlineHtml(block.replace(/\n+/g, "<br>"))}</p>`);
  }

  return html.join("");
}

export default function DictionaryEntryBody({ entryText }: { entryText: string }) {
  const html = formatDictionaryRichText(entryText);
  if (!html) return null;
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none leading-6 prose-p:my-2 prose-blockquote:my-2 prose-blockquote:text-foreground/90 prose-mark:bg-amber-300/40 dark:prose-mark:bg-amber-400/30 prose-mark:px-1 prose-mark:rounded-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
