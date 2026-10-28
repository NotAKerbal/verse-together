import type { VerseTextRange } from "../../convex/annotationRules";

export type SelectedVerseTextRange = VerseTextRange & { chapter?: number };

/** Note blocks have contiguous bounds, so a selection across excluded verses needs one block per run. */
export function selectedVersePassages(ranges: readonly SelectedVerseTextRange[]): Array<{ verseStart: number; verseEnd: number; text: string }> {
  const passages: Array<{ verseStart: number; verseEnd: number; text: string }> = [];
  let previousChapter: number | undefined;
  for (const range of ranges) {
    const text = range.text.slice(range.start, range.end).trim();
    if (!text) continue;
    const last = passages[passages.length - 1];
    if (last && range.chapter === previousChapter && range.verse === last.verseEnd + 1) {
      last.verseEnd = range.verse;
      last.text += `\n\n${text}`;
    } else {
      passages.push({ verseStart: range.verse, verseEnd: range.verse, text });
    }
    previousChapter = range.chapter;
  }
  return passages;
}

/** Scripture text nodes only: verse badges, comparison text, and controls never count. */
export function scriptureTextNodes(element: HTMLElement): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.parentElement?.closest("[data-verse-ignore], button, sup, [aria-hidden='true']")) nodes.push(node as Text);
  }
  return nodes;
}

/** Map displayed typography back to canonical scripture offsets; refuse any other text mismatch. */
export function scriptureSourceOffsets(source: string, displayed: string): number[] | null {
  const offsets = [0];
  let at = 0;
  for (let index = 0; index < displayed.length; index++) {
    if (displayed[index] === "—" && source.slice(at, at + 2) === "--") at += 2;
    else if (displayed[index] === source[at]) at++;
    else return null;
    offsets.push(at);
  }
  return at === source.length ? offsets : null;
}

/** Clip to actual selected characters, excluding a next verse touched only at its boundary. */
export function selectedVerseRanges(range: Range, container: HTMLElement): SelectedVerseTextRange[] {
  const ranges: SelectedVerseTextRange[] = [];
  for (const verse of container.querySelectorAll<HTMLElement>("[data-verse]")) {
    for (const element of verse.querySelectorAll<HTMLElement>("[data-verse-text]")) {
      const nodes = scriptureTextNodes(element);
      const displayed = nodes.map(node => node.data).join("");
      const text = element.dataset.verseSource ?? displayed;
      const offsets = scriptureSourceOffsets(text, displayed);
      if (!offsets) continue;
      let offset = 0;
      let start = Infinity;
      let end = 0;
      for (const node of nodes) {
        if (range.intersectsNode(node)) {
          const from = range.startContainer === node ? range.startOffset : 0;
          const to = range.endContainer === node ? range.endOffset : node.length;
          if (to > from) { start = Math.min(start, offset + from); end = Math.max(end, offset + to); }
        }
        offset += node.length;
      }
      while (start < end && /\s/.test(displayed[start])) start++;
      while (end > start && /\s/.test(displayed[end - 1])) end--;
      if (start < end) {
        const number = Number(verse.dataset.verse);
        const chapter = verse.dataset.chapter === undefined ? undefined : Number(verse.dataset.chapter);
        if (Number.isInteger(number) && !ranges.some(item => item.verse === number && item.chapter === chapter)) {
          ranges.push({ verse: number, start: offsets[start], end: offsets[end], text, ...(chapter === undefined ? {} : { chapter }) });
        }
      }
    }
  }
  return ranges;
}

/** Rebuild a native selection after inline mark spans change the text-node boundaries. */
export function restoreVerseRange(container: HTMLElement, ranges: readonly SelectedVerseTextRange[]): Range | null {
  const points: Array<{ node: Text; offset: number }> = [];
  for (const [range, offset] of [[ranges[0], ranges[0]?.start], [ranges[ranges.length - 1], ranges[ranges.length - 1]?.end]] as const) {
    if (!range) return null;
    const chapter = range.chapter === undefined ? "" : `[data-chapter="${range.chapter}"]`;
    const elements = container.querySelectorAll<HTMLElement>(`[data-verse="${range.verse}"]${chapter} [data-verse-text]`);
    let point: { node: Text; offset: number } | undefined;
    for (const element of elements) {
      const nodes = scriptureTextNodes(element);
      const displayed = nodes.map(node => node.data).join("");
      if ((element.dataset.verseSource ?? displayed) !== range.text) continue;
      const offsets = scriptureSourceOffsets(range.text, displayed);
      if (!offsets) continue;
      let remaining = offsets.indexOf(offset);
      if (remaining < 0) continue;
      for (const node of nodes) {
        if (remaining <= node.length) { point = { node, offset: remaining }; break; }
        remaining -= node.length;
      }
      if (point) break;
    }
    if (!point) return null;
    points.push(point);
  }
  const result = container.ownerDocument.createRange();
  result.setStart(points[0].node, points[0].offset);
  result.setEnd(points[1].node, points[1].offset);
  return result;
}
