// A verse's study paths (the web's VerseStudyPaths.tsx): each path's kind and verses, its direction and why it may
// repay attention, what to notice while rereading, the scriptures it names (opened in the reader) and the sources
// and videos it was grounded in (opened in the browser), with the web's caution that AI found them.

import { useRouter } from "expo-router";
import { Fragment, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { ChapterInsightKind, ChapterInsightScriptureLink, ChapterStudyPath } from "@/lib/chapterInsights";
import { openExternal } from "../../components/Blocks";
import Sheet from "../../components/Sheet";
import { Icon } from "../../components/ui";
import { toAppHref } from "../../navigation/hrefs";
import { useTheme } from "../../theme/theme";
import type { ThemeColors } from "../../theme/tokens";
import { fonts } from "../../theme/tokens";
import type { VerseNoteRef } from "./journalRefs";

const KIND_LABELS: Record<ChapterInsightKind, string> = {
  cross_reference: "Cross-reference",
  doctrinal_context: "Doctrinal context",
  historical_context: "Historical context",
  word_or_phrase: "Word or phrase",
  textual_pattern: "Textual pattern",
  open_question: "Open question",
};

function kindTint(colors: ThemeColors, kind: ChapterInsightKind): string {
  if (kind === "doctrinal_context") return colors.accentMint;
  if (kind === "historical_context") return colors.accentNote;
  if (kind === "word_or_phrase") return colors.accentPrimary;
  if (kind === "open_question") return colors.accentCoral;
  return colors.accentSkySoft;
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function scriptureLinkHref(link: ChapterInsightScriptureLink): string {
  return toAppHref(`/browse/${encodeURIComponent(link.volume)}/${encodeURIComponent(link.book)}/${link.chapter}#v-${link.verse_start}`);
}

/** The path's prose with each scripture it names as a link into the reader (linkedScriptureText). */
function Linked({ text, links, onOpen }: { text: string; links: ChapterInsightScriptureLink[]; onOpen: (link: ChapterInsightScriptureLink) => void }): ReactNode {
  const { colors } = useTheme();
  if (links.length === 0) return text;
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[–—]/g, "-");
  const byReference = new Map(links.map((link) => [normalize(link.reference), link]));
  const pattern = links
    .map((link) => link.reference)
    .sort((left, right) => right.length - left.length)
    .map((reference) => reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-–—]"))
    .join("|");
  if (!pattern) return text;
  return text.split(new RegExp(`(${pattern})`, "gi")).map((part, index) => {
    const link = byReference.get(normalize(part));
    return link ? (
      <Text key={`${part}-${index}`} accessibilityRole="link" onPress={() => onOpen(link)} style={{ fontFamily: fonts.sansSemiBold, color: colors.accentSecondary, textDecorationLine: "underline" }}>
        {part}
      </Text>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    );
  });
}

function Label({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.9, color: colors.foregroundSoft }}>{children.toUpperCase()}</Text>;
}

export default function StudyPathsSheet({ paths, onClose }: { paths: ChapterStudyPath[]; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const open = (link: ChapterInsightScriptureLink) => {
    onClose();
    router.push(scriptureLinkHref(link) as never);
  };
  const prose = { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22 } as const;
  return (
    <Sheet visible={paths.length > 0} title="Study paths" onClose={onClose} testID="study-paths">
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>
        {paths.length === 1 ? "1 direction to explore" : `${paths.length} directions to explore`}
      </Text>
      {paths.map((path, index) => {
        const articles = path.sources.filter((source) => source.format !== "video");
        const videos = path.sources.filter((source) => source.format === "video");
        return (
          <View key={`${path.kind}-${path.title}-${index}`} style={{ gap: 8, paddingTop: index ? 16 : 0, borderTopWidth: index ? 1 : 0, borderTopColor: colors.surfaceBorder }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: kindTint(colors, path.kind), overflow: "hidden", fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: colors.foreground }}>
                {KIND_LABELS[path.kind].toUpperCase()}
              </Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: colors.foregroundSoft }}>
                {`${path.verse_numbers.length === 1 ? "VERSE" : "VERSES"} ${path.verse_numbers.join(", ")}`}
              </Text>
            </View>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 24, color: colors.foreground }}>
              <Linked text={path.title} links={path.scripture_links} onOpen={open} />
            </Text>
            <Text style={{ ...prose, color: colors.foreground }}>
              <Linked text={path.direction} links={path.scripture_links} onOpen={open} />
            </Text>
            {path.why ? (
              <Text style={{ ...prose, color: colors.foregroundMuted }}>
                <Linked text={path.why} links={path.scripture_links} onOpen={open} />
              </Text>
            ) : null}
            {path.look_for.length ? (
              <View style={{ gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCardSoft }}>
                <Label>As you reread, notice</Label>
                {path.look_for.map((item) => (
                  <Text key={item} style={{ ...prose, color: colors.foreground }}>
                    {"•  "}
                    <Linked text={item} links={path.scripture_links} onOpen={open} />
                  </Text>
                ))}
              </View>
            ) : null}
            {path.scripture_links.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12 }}>
                <Label>Scriptures</Label>
                {path.scripture_links.map((link) => (
                  <Pressable key={`${link.volume}-${link.book}-${link.chapter}-${link.verse_start}-${link.verse_end}`} accessibilityRole="link" onPress={() => open(link)} style={{ minHeight: 40, justifyContent: "center" }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentSecondary, textDecorationLine: "underline" }}>{link.reference}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {articles.length ? (
              <View style={{ gap: 2 }}>
                <Label>Sources</Label>
                {articles.map((source) => (
                  <Pressable key={source.url} accessibilityRole="link" accessibilityHint={`Opens ${sourceHost(source.url)} in the browser`} onPress={() => void openExternal(source.url)} style={{ minHeight: 40, justifyContent: "center" }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentSecondary }}>
                      <Text style={{ textDecorationLine: "underline" }}>{source.title}</Text>
                      <Text style={{ fontFamily: fonts.sans, color: colors.foregroundSoft }}>{` · ${sourceHost(source.url)}`}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {videos.length ? (
              <View style={{ gap: 2 }}>
                <Label>Videos</Label>
                {videos.map((source) => (
                  <Pressable key={source.url} accessibilityRole="link" accessibilityHint={`Opens ${sourceHost(source.url)} in the browser`} onPress={() => void openExternal(source.url)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.accentSkySoft }}>
                      <Icon name="play" size={9} color={colors.foreground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.foreground }}>{source.title}</Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{sourceHost(source.url)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={{ fontFamily: fonts.sans, fontSize: 11, lineHeight: 16, color: colors.foregroundSoft }}>AI found these directions. Read the sources and decide what holds up.</Text>
    </Sheet>
  );
}

/** The notes linking to one verse, when there are several to choose from (VerseInsightMarker's picker). */
export function VerseNotesSheet({ verse, refs, onChoose, onClose }: { verse: number | null; refs: VerseNoteRef[]; onChoose: (noteId: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={verse !== null && refs.length > 0} title={`Notes on verse ${verse ?? ""}`} onClose={onClose} testID="verse-notes">
      {refs.map((ref) => (
        <Pressable
          key={ref.noteId}
          accessibilityRole="button"
          accessibilityLabel={`Open your note "${ref.title}"`}
          onPress={() => onChoose(ref.noteId)}
          style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard })}
        >
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground }}>{ref.title || "Untitled note"}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{ref.verseStart === ref.verseEnd ? `v. ${ref.verseStart}` : `vv. ${ref.verseStart}-${ref.verseEnd}`}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
