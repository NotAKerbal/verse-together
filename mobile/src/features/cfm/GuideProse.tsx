// A study guide's prose in the lesson, selectable and annotated as on the website (useGuideHighlights): the same
// layout as Blocks (headings, paragraphs, lists, quotes, tables, figures, Sources), but its words are native
// selectable text (ProseText), each run of paragraphs and headings one text so a selection can run across them. A
// selection becomes the exact span of its part's text (guideProse.ts, guideAnchors.ts); saved spans are drawn on
// exactly their words; links open with a tap.
//
// useGuideProse holds the screen's prose state (the parts' text, the saved spans placed in it, the one prose
// selection) and GuideProseProvider hands it to every GuideProse on the page.

import { Image } from "expo-image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Block, NativeGuide, PassageRef, Run } from "../../cfm/guideTypes";
import { openExternal, type AnchorElement } from "../../components/Blocks";
import { Icon } from "../../components/ui";
import { publicImage } from "../../data/images";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import {
  describeSpan,
  resolveAnchor,
  type Described,
  type GuideHighlight,
  type GuidePart,
  type PlacedGuideHighlight,
} from "@/features/comeFollowMe/guideAnchors";
import {
  blockHeadings,
  buildProseDocument,
  guideReference,
  guideRoots,
  isLinkRun,
  partIndex,
  partSpan,
  proseMarks,
  rootKey,
  shownSpan,
  shownWords,
  type PartHeading,
  type PartIndex,
  type ProseDocument,
  type ProseParagraph,
  type ProseParagraphLook,
  type ProseRunStyle,
} from "./guideProse";
import ProseText, { type ProseTextHandle } from "./ProseText";

type Anchor = Pick<AnchorElement, "measureLayout">;
export type Register = (id: string, element: Anchor | null) => void;
export type LinkHandlers = { onRef: (ref: PassageRef) => void; onAnchor: (id: string) => void };

/** The one prose selection on the page: where it is shown, its span in its part (or why it has none), its words. */
export type ProseSelection = {
  /** The text it is shown in, and its shown offsets there. */
  flow: string;
  start: number;
  end: number;
  part: GuidePart | null;
  described: Described;
  text: string;
  reference: string;
  /** Its identity: its part and trimmed span (or its words, when it can't be anchored). */
  key: string;
};

type Flow = { doc: ProseDocument; part: GuidePart | null };

type ProseState = {
  place: (root: string) => { part: GuidePart; start: number } | undefined;
  placed: Record<GuidePart, PlacedGuideHighlight[]>;
  selection: ProseSelection | null;
  select: (flow: string, start: number, end: number) => void;
  registerFlow: (flow: string, value: Flow | null) => void;
  /** A text leaving the page (its disclosure closed) takes its selection with it. */
  release: (flow: string) => void;
  links: LinkHandlers;
  register: Register;
};

const ProseContext = createContext<ProseState | null>(null);

const NO_SPANS: Record<GuidePart, PlacedGuideHighlight[]> = { introduction: [], reader: [] };

/**
 * The page's prose state. `rows` are the guide's saved spans (guideAnnotationStore); they are placed in the parts'
 * text with guideAnchors.resolveAnchor, so a span whose words changed or moved out of reach stays unplaced (and
 * saved) rather than marking other words.
 */
export function useGuideProse(guide: NativeGuide, rows: readonly GuideHighlight[], links: LinkHandlers, register: Register, onSelected?: () => void) {
  // Told when the reader selects prose (the screen ends any other selection then).
  const selected = useRef(onSelected);
  useEffect(() => {
    selected.current = onSelected;
  });
  const indexes = useMemo(() => {
    const roots = guideRoots(guide);
    return { introduction: partIndex("introduction", roots.introduction), reader: partIndex("reader", roots.reader) } as Record<GuidePart, PartIndex>;
  }, [guide]);
  const headings = useMemo(() => {
    const out: Record<GuidePart, PartHeading[]> = { introduction: [], reader: [] };
    const add = (part: GuidePart, key: string, blocks: readonly Block[]) => blockHeadings(blocks, key, indexes[part].spans.get(key)?.start, out[part]);
    add("introduction", rootKey.introduction, guide.introduction);
    for (const section of guide.sections) {
      add("reader", rootKey.section(section.id), section.heading);
      for (const block of section.blocks) {
        add("reader", rootKey.preview(block.id), block.preview);
        add("reader", rootKey.more(block.id), block.more);
      }
    }
    add("reader", rootKey.fallback, guide.fallback);
    add("reader", rootKey.closing, guide.closing);
    return out;
  }, [guide, indexes]);
  const placed = useMemo(() => {
    if (!rows.length) return NO_SPANS;
    const out: Record<GuidePart, PlacedGuideHighlight[]> = { introduction: [], reader: [] };
    for (const row of rows) {
      const at = resolveAnchor(indexes[row.part], row);
      if (at) out[row.part].push({ row, start: at.start, end: at.end });
    }
    return out;
  }, [rows, indexes]);
  const place = useCallback(
    (root: string) => {
      for (const part of ["introduction", "reader"] as const) {
        const span = indexes[part].spans.get(root);
        if (span) return { part, start: span.start };
      }
      return undefined;
    },
    [indexes]
  );

  const flows = useRef(new Map<string, Flow>());
  const registerFlow = useCallback((flow: string, value: Flow | null) => {
    if (value) flows.current.set(flow, value);
    else flows.current.delete(flow);
  }, []);
  const [selection, setSelection] = useState<ProseSelection | null>(null);

  const describe = useCallback(
    (flow: string, part: GuidePart | null, start: number, end: number, span: { start: number; end: number } | null, text: string): ProseSelection => {
      const described: Described = part && span ? describeSpan(indexes[part], span.start, span.end) : { ok: false, reason: "empty" };
      const reference = part && span ? guideReference(indexes[part], headings[part], described.ok ? described.start : span.start) : "Study guide";
      const key = described.ok ? `${part}:${described.start}:${described.end}` : `${part}:${described.reason}:${text}`;
      return { flow, start, end, part, described, text, reference, key };
    },
    [indexes, headings]
  );

  const select = useCallback(
    (flow: string, start: number, end: number) => {
      const value = flows.current.get(flow);
      if (!value || end <= start) {
        // A collapsed selection (a tap) in the selected text ends it; anywhere else it changes nothing.
        setSelection((current) => (current?.flow === flow ? null : current));
        return;
      }
      const span = value.part ? partSpan(value.doc, start, end) : null;
      setSelection(describe(flow, value.part, start, end, span, shownWords(value.doc, start, end)));
      selected.current?.();
    },
    [describe]
  );

  /** Selects a saved span's words (the Annotate panel's saved passages), where the page first shows them. */
  const selectSpan = useCallback(
    (part: GuidePart, start: number, end: number) => {
      // The text holding its first word, else any text showing some of it.
      const candidates = [...flows.current].filter(([, value]) => value.part === part);
      const found =
        candidates.find(([, value]) => value.doc.sources.includes(start)) ?? candidates.find(([, value]) => shownSpan(value.doc, start, end) !== null);
      const shown = found ? shownSpan(found[1].doc, start, end) : null;
      if (!found || !shown) return;
      setSelection(describe(found[0], part, shown.start, shown.end, { start, end }, indexes[part].text.slice(start, end).replace(/\s+/g, " ").trim()));
    },
    [describe, indexes]
  );

  const clear = useCallback(() => setSelection(null), []);
  const release = useCallback((flow: string) => setSelection((current) => (current?.flow === flow ? null : current)), []);
  const state: ProseState = useMemo(
    () => ({ place, placed, selection, select, registerFlow, release, links, register }),
    [place, placed, selection, select, registerFlow, release, links, register]
  );
  return { state, selection, clear, selectSpan, placed, indexes };
}

export function GuideProseProvider({ state, children }: { state: ProseState; children: ReactNode }) {
  return <ProseContext.Provider value={state}>{children}</ProseContext.Provider>;
}

// ---------------------------------------------------------------------------------------------------------------
// Looks (Blocks.tsx's sizes and faces)

type Colors = ReturnType<typeof useTheme>["colors"];

function proseStyle(colors: Colors) {
  return (run: Run, look: ProseParagraphLook): ProseRunStyle => {
    const color = isLinkRun(run) ? (run.ref ? colors.accentRubric : colors.foreground) : look.color;
    if (run.code) return { font: fonts.mono, size: look.size * 0.9, color };
    if (look.font.startsWith("DMSans")) {
      return { font: run.bold ? fonts.sansBold : look.font, size: look.size, color, letterSpacing: look.letterSpacing, ...(run.italic ? { style: "italic" as const } : null) };
    }
    const style = run.bold && run.italic ? "boldItalic" : run.bold ? "bold" : run.italic ? "italic" : look.style;
    return { font: look.font, size: look.size, color, letterSpacing: look.letterSpacing, ...(style ? { style } : null) };
  };
}

function bodyLook(colors: Colors, size: number, serif: boolean, spacingAfter = 14): ProseParagraphLook {
  return { font: serif ? fonts.serif : fonts.sans, size, lineHeight: size * 1.65, color: colors.foreground, spacingAfter };
}

function headingLook(colors: Colors, depth: number, spacingAfter = 14): ProseParagraphLook {
  const size = depth <= 1 ? 30 : depth === 2 ? 26 : depth === 3 ? 20 : 17;
  return { font: fonts.serif, size, lineHeight: size * 1.22, color: colors.foreground, spacingAfter };
}

// ---------------------------------------------------------------------------------------------------------------
// One selectable text

type FlowParagraph = ProseParagraph & { id?: string };

/** Paragraphs as one native selectable text, with the page's marks on it and its ids registered as anchors. */
function ProseFlow({ flow, paragraphs, testID }: { flow: string; paragraphs: readonly FlowParagraph[]; testID?: string }) {
  const { colors } = useTheme();
  const state = useContext(ProseContext)!;
  const { place, placed, selection, select, registerFlow, release, links, register } = state;
  const box = useRef<ComponentRef<typeof View>>(null);
  const text = useRef<ProseTextHandle>(null);
  const root = paragraphs[0]?.root ?? "";
  const where = place(root);
  const part = where?.part ?? null;
  const base = where?.start;
  const doc = useMemo(() => buildProseDocument(paragraphs, proseStyle(colors), (key) => (key === root ? base : undefined)), [paragraphs, colors, root, base]);
  const marks = useMemo(() => (part ? proseMarks(doc, placed[part]) : []), [doc, placed, part]);
  const selected = selection?.flow === flow ? { start: selection.start, end: selection.end } : null;

  useEffect(() => {
    registerFlow(flow, { doc, part });
    return () => registerFlow(flow, null);
  }, [flow, doc, part, registerFlow]);
  useEffect(() => () => release(flow), [flow, release]);

  useEffect(() => {
    const ids: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      if (!paragraph.id) return;
      const at = doc.paragraphs[index]?.start ?? 0;
      ids.push(paragraph.id);
      register(paragraph.id, {
        measureLayout: (relative, onSuccess, onFail) =>
          box.current?.measureLayout(
            relative,
            (x, y, width, height) => void (text.current?.offsetTop(at) ?? Promise.resolve(-1)).then((top) => onSuccess(x, y + Math.max(0, top), width, height)),
            onFail
          ),
      });
    });
    return () => ids.forEach((id) => register(id, null));
  }, [paragraphs, doc, register]);

  const onLink = useCallback(
    (run: Run) => {
      if (run.ref) links.onRef(run.ref);
      else if (run.anchor) links.onAnchor(run.anchor);
      else if (run.url) void openExternal(run.url);
    },
    [links]
  );

  return (
    <View ref={box} collapsable={false}>
      <ProseText ref={text} testID={testID ?? `prose-${flow}`} doc={doc} marks={marks} selected={selected} onSelectionChange={(start, end) => select(flow, start, end)} onLink={onLink} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

type Ctx = { root: string; size: number; serif: boolean; colors: Colors };

function Sources({ items, note, ctx, flow }: { items: Run[][]; note?: string; ctx: Ctx; flow: string }) {
  const { colors } = ctx;
  const [open, setOpen] = useState(false);
  const look = useMemo(() => ({ font: fonts.sans, size: 14, lineHeight: 21, color: colors.foregroundMuted, spacingAfter: 0 }), [colors]);
  const paragraphs = useMemo(() => items.map((runs) => [{ runs, root: ctx.root, look }]), [items, ctx.root, look]);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={11} color={colors.foregroundSoft} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: colors.foregroundSoft }}>Sources</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingLeft: 18, paddingBottom: 8 }}>
          {paragraphs.map((item, index) => (
            <ProseFlow key={index} flow={`${flow}/source-${index}`} paragraphs={item} />
          ))}
          {note ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, fontStyle: "italic", color: colors.foregroundSoft }}>{note}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** A heading the page keeps as it is (the chapter's label and title, a verse heading's reference and title). */
function SpecialHeading({ block, ctx, flow, onRef }: { block: Extract<Block, { kind: "heading" }>; ctx: Ctx; flow: string; onRef: (ref: PassageRef) => void }) {
  const { colors } = ctx;
  const state = useContext(ProseContext)!;
  const box = useRef<ComponentRef<typeof View>>(null);
  const id = block.id;
  useEffect(() => {
    if (!id) return;
    state.register(id, box.current);
    return () => state.register(id, null);
  }, [id, state.register]);
  const titleLook = useMemo(
    () =>
      block.chapterLabel
        ? { font: fonts.serif, size: 26, lineHeight: 31, color: colors.foreground, spacingAfter: 0 }
        : { font: fonts.serif, size: 20, lineHeight: 26, color: colors.foreground, spacingAfter: 0 },
    [block.chapterLabel, colors]
  );
  const refLook = useMemo(() => ({ font: fonts.sansSemiBold, size: 13, lineHeight: 19, color: colors.accentRubric, spacingAfter: 2 }), [colors]);
  const paragraphs = useMemo(() => {
    const out: FlowParagraph[] = [];
    if (block.refRuns && !block.chapterLabel) out.push({ runs: block.refRuns, root: ctx.root, look: refLook });
    if (block.title) out.push({ runs: block.title, root: ctx.root, look: titleLook });
    return out;
  }, [block, ctx.root, refLook, titleLook]);
  return (
    <View ref={box} collapsable={false} style={{ gap: 2, marginTop: block.chapterLabel ? 8 : 4 }}>
      {block.chapterLabel ? (
        <Text
          accessibilityRole="header"
          onPress={block.runs[0]?.ref ? () => onRef(block.runs[0].ref!) : undefined}
          style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.accentRubric }}
        >
          {block.chapterLabel}
        </Text>
      ) : null}
      {paragraphs.length ? <ProseFlow flow={flow} paragraphs={paragraphs} /> : null}
    </View>
  );
}

function BlockView({ block, ctx, flow }: { block: Block; ctx: Ctx; flow: string }): ReactNode {
  const { colors } = ctx;
  switch (block.kind) {
    case "heading":
    case "p":
      // Paragraphs and headings are read as flows (TextRunGroup, SpecialHeading).
      return null;
    case "list":
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 8, paddingLeft: 4 }}>
              <Text style={{ minWidth: 18, fontFamily: ctx.serif ? fonts.serif : fonts.sans, fontSize: ctx.size, lineHeight: ctx.size * 1.65, color: colors.foregroundSoft }}>
                {block.ordered ? `${(block.start ?? 1) + index}.` : "•"}
              </Text>
              <View style={{ flex: 1 }}>
                <ProseBlocks blocks={item} ctx={ctx} flow={`${flow}/${index}`} gap={6} />
              </View>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View style={{ borderLeftWidth: 2, borderLeftColor: colors.accentRubricLine, paddingLeft: 14 }}>
          <ProseBlocks blocks={block.blocks} ctx={ctx} flow={flow} gap={8} />
        </View>
      );
    case "table": {
      const look = (header: boolean) => ({ font: header ? fonts.sansSemiBold : fonts.sans, size: 14, lineHeight: 20, color: colors.foreground, spacingAfter: 0 });
      return (
        <ScrollView horizontal accessibilityLabel="Scrollable table" contentContainerStyle={{ flexDirection: "column" }}>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.rule }}>
              {row.cells.map((cell, cellIndex) => (
                <View key={cellIndex} style={{ width: 200, padding: 8 }}>
                  <TableCell runs={cell} root={ctx.root} look={look(row.header)} flow={`${flow}/${rowIndex}.${cellIndex}`} />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      );
    }
    case "figure": {
      const source = publicImage(block.image);
      const width = Math.min(280, block.width);
      return (
        <View style={{ alignSelf: "center", width, gap: 6 }}>
          {source ? <Image source={source} accessibilityLabel={block.alt} style={{ width, aspectRatio: block.width / block.height, borderRadius: 8 }} contentFit="cover" /> : null}
          {block.labels?.length ? (
            <View accessibilityLabel={block.labelsHeading} style={{ gap: 2 }}>
              {block.labels.map((label) => (
                <Text key={label} style={{ fontFamily: fonts.serif, fontSize: 14, fontStyle: "italic", color: colors.foregroundMuted }}>
                  {label}
                </Text>
              ))}
            </View>
          ) : null}
          {block.caption ? <TableCell runs={block.caption} root={ctx.root} look={{ font: fonts.sans, size: 12, lineHeight: 17, color: colors.foregroundSoft, spacingAfter: 0 }} flow={`${flow}/caption`} /> : null}
        </View>
      );
    }
    case "sources":
      return <Sources items={block.items} note={block.note} ctx={ctx} flow={flow} />;
    case "rule":
      return <View style={{ height: 1, backgroundColor: colors.rule, marginVertical: 8 }} />;
  }
}

function TableCell({ runs, root, look, flow }: { runs: Run[]; root: string; look: ProseParagraphLook; flow: string }) {
  const paragraphs = useMemo(() => [{ runs, root, look }], [runs, root, look.font, look.size, look.color]);
  return <ProseFlow flow={flow} paragraphs={paragraphs} />;
}

/** Consecutive plain paragraphs and headings, read as one selectable text. */
function TextRunGroup({ blocks, ctx, flow, gap }: { blocks: Array<Extract<Block, { kind: "p" | "heading" }>>; ctx: Ctx; flow: string; gap: number }) {
  const { colors } = ctx;
  const paragraphs = useMemo(
    () =>
      blocks.map((block, index) => {
        const next = blocks[index + 1];
        // The space after a paragraph: the blocks' gap, and a heading's own space above it.
        const after = gap + (next?.kind === "heading" ? (next.depth <= 2 ? 12 : 4) : 0);
        return {
          runs: block.runs,
          root: ctx.root,
          id: block.id,
          look: block.kind === "p" ? bodyLook(colors, ctx.size, ctx.serif, after) : headingLook(colors, block.depth, after),
        };
      }),
    [blocks, ctx.root, ctx.size, ctx.serif, colors, gap]
  );
  const first = blocks[0];
  return (
    <View style={{ marginTop: first?.kind === "heading" ? (first.depth <= 2 ? 12 : 4) : 0 }}>
      <ProseFlow flow={flow} paragraphs={paragraphs} />
    </View>
  );
}

const isPlain = (block: Block): block is Extract<Block, { kind: "p" | "heading" }> =>
  block.kind === "p" || (block.kind === "heading" && !block.chapterLabel && !block.refRuns);

function ProseBlocks({ blocks, ctx, flow, gap = 14 }: { blocks: readonly Block[]; ctx: Ctx; flow: string; gap?: number }) {
  const state = useContext(ProseContext)!;
  const groups = useMemo(() => {
    const out: Array<{ at: number; plain: Array<Extract<Block, { kind: "p" | "heading" }>> } | { at: number; block: Block }> = [];
    blocks.forEach((block, index) => {
      const last = out[out.length - 1];
      if (isPlain(block)) {
        if (last && "plain" in last) last.plain.push(block);
        else out.push({ at: index, plain: [block] });
      } else out.push({ at: index, block });
    });
    return out;
  }, [blocks]);
  return (
    <View style={{ gap }}>
      {groups.map((group) =>
        "plain" in group ? (
          <TextRunGroup key={group.at} blocks={group.plain} ctx={ctx} flow={`${flow}/${group.at}`} gap={gap} />
        ) : group.block.kind === "heading" ? (
          <SpecialHeading key={group.at} block={group.block} ctx={ctx} flow={`${flow}/${group.at}`} onRef={state.links.onRef} />
        ) : (
          <BlockView key={group.at} block={group.block} ctx={ctx} flow={`${flow}/${group.at}`} />
        )
      )}
    </View>
  );
}

/**
 * One element of guide prose (`root`: its key, guideProse.rootKey), laid out as Blocks lays it out, with its words
 * selectable and annotated.
 */
export default function GuideProse({ blocks, root, size = 17, serif = true }: { blocks: readonly Block[]; root: string; size?: number; serif?: boolean }) {
  const { colors } = useTheme();
  const ctx = useMemo(() => ({ root, size, serif, colors }), [root, size, serif, colors]);
  return <ProseBlocks blocks={blocks} ctx={ctx} flow={root} />;
}
