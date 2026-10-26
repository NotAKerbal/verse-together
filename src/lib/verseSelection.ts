import type { VerseTextRange } from "../../convex/annotationRules";

/** Scripture text nodes only: verse badges, comparison text, and controls never count. */
export function scriptureTextNodes(element: HTMLElement): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.parentElement?.closest("[data-verse-ignore], button, sup, [aria-hidden='true']"))) nodes.push(node as Text);
  }
  return nodes;
}

/** Clip to actual selected characters, excluding a next verse touched only at its boundary. */
export function selectedVerseRanges(range: Range, container: HTMLElement): VerseTextRange[] {
  const ranges: VerseTextRange[] = [];
  for (const verse of container.querySelectorAll<HTMLElement>("[data-verse]")) {
    for (const element of verse.querySelectorAll<HTMLElement>("[data-verse-text]")) {
      const nodes = scriptureTextNodes(element);
      const text = nodes.map(node => node.data).join("");
      let offset = 0;
      let start = Infinity;
      let end = 0;
      for (const node of nodes) {
        if (range.intersectsNode(node)) {
          const from = range.startContainer === node ? range.startOffset : 0;
          const to = range.endContainer === node ? range.endOffset : node.length;
          // intersectsNode is strict for text nodes but includes empty endpoints in some browsers.
          if (to > from) { start = Math.min(start, offset + from); end = Math.max(end, offset + to); }
        }
        offset += node.length;
      }
      // Selection whitespace between verses isn't a selected verse.
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (start < end) {
        const number = Number(verse.dataset.verse);
        if (Number.isInteger(number) && !ranges.some(item => item.verse === number)) ranges.push({ verse: number, start, end, text });
      }
    }
  }
  return ranges;
}

/** Rebuild a native selection after inline mark spans change the text-node boundaries. */
export function restoreVerseRange(container: HTMLElement, ranges: readonly VerseTextRange[]): Range | null {
  const points: Array<{ node: Text; offset: number }> = [];
  for (const [range, offset] of [[ranges[0], ranges[0]?.start], [ranges[ranges.length - 1], ranges[ranges.length - 1]?.end]] as const) {
    if (!range) return null;
    const elements = container.querySelectorAll<HTMLElement>(`[data-verse="${range.verse}"] [data-verse-text]`);
    let point: { node: Text; offset: number } | undefined;
    for (const element of elements) {
      const nodes = scriptureTextNodes(element);
      if (nodes.map(node => node.data).join("") !== range.text) continue;
      let remaining = offset;
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
