import { decodeDictionaryEntities, formatDictionaryMarkup as formatSharedDictionaryMarkup, parseDictionaryAttributes } from "@/lib/dictionaryFormatting";

export { decodeBibleTargetToHref } from "@/lib/dictionaryFormatting";

export function formatDictionaryMarkup(rawText: string): string {
  return formatSharedDictionaryMarkup(rawText, "native");
}

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
      push(decodeDictionaryEntities(chunk));
      continue;
    }
    const match = chunk.match(/^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)>$/i);
    if (!match) continue;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attrs = closing ? {} : parseDictionaryAttributes(match[3] ?? "");
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
