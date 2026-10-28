// Native rendering of guide and note prose (the web's .guide prose styles in studyCompanion.module.css and
// NoteMarkdown.tsx): serif paragraphs, headings, lists, quotes, tables, figures with credits, and Sources panels.
// Links go where they point: a scripture passage (scrolled to in a lesson, else opened in the reader), an anchor
// in the page, an in-app path, or a web page in the browser.

import { Image } from "expo-image";
import { useState, type ComponentRef, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View, type TextStyle } from "react-native";
import type { Block, PassageRef, Run } from "../cfm/guideTypes";
import { publicImage } from "../data/images";
import { useTheme } from "../theme/theme";
import { fonts } from "../theme/tokens";
import { Icon } from "./ui";

export type LinkHandlers = {
  onRef?: (ref: PassageRef) => void;
  onAnchor?: (id: string) => void;
  onPath?: (path: string) => void;
};

/** Called with each block id's element, so a screen can scroll to it. */
export type AnchorElement = ComponentRef<typeof View>;
export type AnchorRegistrar = (id: string, element: AnchorElement | null) => void;

type Ctx = LinkHandlers & { registerAnchor?: AnchorRegistrar; size: number; serif: boolean };

export async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing can open it; the link text stays readable in place.
  }
}

function runLabel(run: Run & { path?: string }) {
  if (run.ref) return "Opens the passage";
  if (run.anchor) return "Goes to that section";
  if (run.path) return "Opens in the app";
  if (run.url) return `Opens ${run.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]} in the browser`;
  return undefined;
}

export function Runs({ runs, ctx, style }: { runs: Array<Run & { path?: string }>; ctx: LinkHandlers; style?: TextStyle }) {
  const { colors } = useTheme();
  return (
    <>
      {runs.map((run, index) => {
        const link = run.ref || run.url || run.anchor || run.path;
        const runStyle: TextStyle = {
          ...(run.bold ? { fontWeight: "700" } : null),
          ...(run.italic ? { fontStyle: "italic" } : null),
          ...(run.code ? { fontFamily: fonts.mono, fontSize: (style?.fontSize ?? 16) * 0.9 } : null),
          ...(link
            ? {
                color: run.ref ? colors.accentRubric : colors.foreground,
                textDecorationLine: "underline",
                textDecorationColor: colors.accentRubricLine,
              }
            : null),
        };
        const onPress = link
          ? () => {
              if (run.ref) ctx.onRef?.(run.ref);
              else if (run.anchor) ctx.onAnchor?.(run.anchor);
              else if (run.path) ctx.onPath?.(run.path);
              else if (run.url) void openExternal(run.url);
            }
          : undefined;
        return (
          <Text key={index} style={runStyle} onPress={onPress} accessibilityRole={link ? "link" : undefined} accessibilityHint={link ? runLabel(run) : undefined} suppressHighlighting={!link}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

function Paragraph({ runs, ctx, style, id }: { runs: Run[]; ctx: Ctx; style?: TextStyle; id?: string }) {
  const { colors } = useTheme();
  const base: TextStyle = {
    fontFamily: ctx.serif ? fonts.serif : fonts.sans,
    fontSize: ctx.size,
    lineHeight: ctx.size * 1.65,
    color: colors.foreground,
  };
  return (
    <View ref={id && ctx.registerAnchor ? (element) => ctx.registerAnchor!(id, element) : undefined} collapsable={false}>
      <Text style={[base, style]}>
        <Runs runs={runs} ctx={ctx} style={{ ...base, ...style }} />
      </Text>
    </View>
  );
}

function Sources({ items, note, ctx }: { items: Run[][]; note?: string; ctx: Ctx }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={11} color={colors.foregroundSoft} />
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: colors.foregroundSoft }}>Sources</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingLeft: 18, paddingBottom: 8 }}>
          {items.map((item, index) => (
            <Text key={index} style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>
              <Runs runs={item} ctx={ctx} />
            </Text>
          ))}
          {note ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, fontStyle: "italic", color: colors.foregroundSoft }}>{note}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function BlockView({ block, ctx }: { block: Block; ctx: Ctx }): ReactNode {
  const { colors } = useTheme();
  switch (block.kind) {
    case "heading": {
      const register = block.id && ctx.registerAnchor ? (element: AnchorElement | null) => ctx.registerAnchor!(block.id!, element) : undefined;
      if (block.chapterLabel) {
        return (
          <View ref={register} collapsable={false} style={{ gap: 2, marginTop: 8 }}>
            <Text
              accessibilityRole="header"
              onPress={block.runs[0]?.ref ? () => ctx.onRef?.(block.runs[0].ref!) : undefined}
              style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.accentRubric }}
            >
              {block.chapterLabel}
            </Text>
            {block.title ? (
              <Text style={{ fontFamily: fonts.serif, fontSize: 26, lineHeight: 31, color: colors.foreground }}>
                <Runs runs={block.title} ctx={ctx} />
              </Text>
            ) : null}
          </View>
        );
      }
      if (block.refRuns) {
        return (
          <View ref={register} collapsable={false} style={{ gap: 2, marginTop: 4 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentRubric }}>
              <Runs runs={block.refRuns} ctx={ctx} />
            </Text>
            {block.title ? (
              <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.foreground }}>
                <Runs runs={block.title} ctx={ctx} />
              </Text>
            ) : null}
          </View>
        );
      }
      const size = block.depth <= 1 ? 30 : block.depth === 2 ? 26 : block.depth === 3 ? 20 : 17;
      return (
        <View ref={register} collapsable={false} style={{ marginTop: block.depth <= 2 ? 12 : 4 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: size * 1.22, color: colors.foreground }}>
            <Runs runs={block.runs} ctx={ctx} />
          </Text>
        </View>
      );
    }
    case "p":
      return <Paragraph runs={block.runs} ctx={ctx} id={block.id} />;
    case "list":
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 8, paddingLeft: 4 }}>
              <Text style={{ minWidth: 18, fontFamily: ctx.serif ? fonts.serif : fonts.sans, fontSize: ctx.size, lineHeight: ctx.size * 1.65, color: colors.foregroundSoft }}>
                {block.ordered ? `${(block.start ?? 1) + index}.` : "•"}
              </Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Blocks blocks={item} {...ctx} />
              </View>
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View style={{ borderLeftWidth: 2, borderLeftColor: colors.accentRubricLine, paddingLeft: 14, gap: 8 }}>
          <Blocks blocks={block.blocks} {...ctx} />
        </View>
      );
    case "table":
      return (
        <ScrollView horizontal accessibilityLabel="Scrollable table" contentContainerStyle={{ flexDirection: "column" }}>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.rule }}>
              {row.cells.map((cell, cellIndex) => (
                <View key={cellIndex} style={{ width: 200, padding: 8 }}>
                  <Text style={{ fontFamily: row.header ? fonts.sansSemiBold : fonts.sans, fontSize: 14, lineHeight: 20, color: colors.foreground }}>
                    <Runs runs={cell} ctx={ctx} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      );
    case "figure": {
      const source = publicImage(block.image);
      const width = Math.min(280, block.width);
      return (
        <View style={{ alignSelf: "center", width, gap: 6 }}>
          {source ? (
            <Image source={source} accessibilityLabel={block.alt} style={{ width, aspectRatio: block.width / block.height, borderRadius: 8 }} contentFit="cover" />
          ) : null}
          {block.labels?.length ? (
            <View accessibilityLabel={block.labelsHeading} style={{ gap: 2 }}>
              {block.labels.map((label) => (
                <Text key={label} style={{ fontFamily: fonts.serif, fontSize: 14, fontStyle: "italic", color: colors.foregroundMuted }}>
                  {label}
                </Text>
              ))}
            </View>
          ) : null}
          {block.caption ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.foregroundSoft }}>
              <Runs runs={block.caption} ctx={ctx} />
            </Text>
          ) : null}
        </View>
      );
    }
    case "sources":
      return <Sources items={block.items} note={block.note} ctx={ctx} />;
    case "rule":
      return <View style={{ height: 1, backgroundColor: colors.rule, marginVertical: 8 }} />;
  }
}

export default function Blocks({
  blocks,
  size = 17,
  serif = true,
  registerAnchor,
  ...handlers
}: { blocks: Block[]; size?: number; serif?: boolean; registerAnchor?: AnchorRegistrar } & LinkHandlers) {
  const ctx: Ctx = { ...handlers, registerAnchor, size, serif };
  return (
    <View style={{ gap: 14 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} ctx={ctx} />
      ))}
    </View>
  );
}
