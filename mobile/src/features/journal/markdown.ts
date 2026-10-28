// A journal note's Markdown as native blocks (the web shows notes through NoteMarkdown/react-markdown). Links follow
// the web's note rule (safeNoteUrl): same-app paths open in the app, http(s) and mailto open outside, anything else
// stays plain text. Raw HTML is shown as text, never interpreted.

import { Lexer, type Token, type Tokens } from "marked";
import type { Block, Run } from "../../cfm/guideTypes";
import { toAppHref } from "../../navigation/hrefs";

export type NoteRun = Run & { path?: string };

function safeLink(href: string): { path?: string; url?: string } {
  const trimmed = href.trim();
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || /[\u0000-\u001f\u007f-\u009f\s\\]/.test(trimmed)) return {};
    return { path: toAppHref(trimmed) };
  }
  if (/[\u0000-\u001f\u007f-\u009f\s\\]/.test(trimmed)) return {};
  return /^(https?:|mailto:)/i.test(trimmed) ? { url: trimmed } : {};
}

function inline(tokens: Token[] | undefined, style: Partial<NoteRun> = {}, out: NoteRun[] = []): NoteRun[] {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
        inline((token as Tokens.Strong).tokens, { ...style, bold: true }, out);
        break;
      case "em":
        inline((token as Tokens.Em).tokens, { ...style, italic: true }, out);
        break;
      case "del":
        inline((token as Tokens.Del).tokens, style, out);
        break;
      case "codespan":
        out.push({ ...style, text: (token as Tokens.Codespan).text, code: true });
        break;
      case "br":
        out.push({ ...style, text: "\n" });
        break;
      case "link": {
        const link = token as Tokens.Link;
        inline(link.tokens, { ...style, ...safeLink(link.href) }, out);
        break;
      }
      case "image":
        out.push({ ...style, text: (token as Tokens.Image).text });
        break;
      case "text": {
        const text = token as Tokens.Text;
        if (text.tokens?.length) inline(text.tokens, style, out);
        else out.push({ ...style, text: decode(text.text) });
        break;
      }
      case "escape":
        out.push({ ...style, text: (token as Tokens.Escape).text });
        break;
      default:
        if ("raw" in token && typeof token.raw === "string") out.push({ ...style, text: token.raw });
    }
  }
  return out;
}

function decode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function blocks(tokens: Token[]): Block[] {
  const out: Block[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        out.push({ kind: "heading", depth: Math.max(2, heading.depth), runs: inline(heading.tokens) });
        break;
      }
      case "paragraph":
        out.push({ kind: "p", runs: inline((token as Tokens.Paragraph).tokens) });
        break;
      case "text": {
        const text = token as Tokens.Text;
        out.push({ kind: "p", runs: text.tokens?.length ? inline(text.tokens) : [{ text: decode(text.text) }] });
        break;
      }
      case "list": {
        const list = token as Tokens.List;
        out.push({
          kind: "list",
          ordered: list.ordered,
          start: typeof list.start === "number" ? list.start : undefined,
          items: list.items.map((item) => blocks(item.tokens)),
        });
        break;
      }
      case "blockquote":
        out.push({ kind: "quote", blocks: blocks((token as Tokens.Blockquote).tokens) });
        break;
      case "code":
        out.push({ kind: "p", runs: [{ text: (token as Tokens.Code).text, code: true }] });
        break;
      case "hr":
        out.push({ kind: "rule" });
        break;
      case "table": {
        const table = token as Tokens.Table;
        out.push({
          kind: "table",
          rows: [
            { header: true, cells: table.header.map((cell) => inline(cell.tokens)) },
            ...table.rows.map((row) => ({ header: false, cells: row.map((cell) => inline(cell.tokens)) })),
          ],
        });
        break;
      }
      case "html":
        out.push({ kind: "p", runs: [{ text: (token as Tokens.HTML).text }] });
        break;
      case "space":
        break;
      default:
        if ("raw" in token && typeof token.raw === "string" && token.raw.trim()) out.push({ kind: "p", runs: [{ text: token.raw }] });
    }
  }
  return out;
}

export function markdownBlocks(markdown: string): Block[] {
  return blocks(new Lexer({ gfm: true, breaks: true }).lex(markdown));
}
