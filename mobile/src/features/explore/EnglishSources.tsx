// Explore's English meanings (the web's EnglishMeaningsSection, DictionaryEntryCard, DictionaryEntryBody,
// EtymologyEntryCard and WordStudyEntry): every dictionary edition's entries and the word histories, each a row that
// opens to its full text and "Add to note". A "See X" reference in an entry looks X up in place.

import { useContext, useMemo, useState } from "react";
import { Text, View, type TextStyle } from "react-native";
import { openExternal } from "../../components/Blocks";
import { toAppHref } from "../../navigation/hrefs";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { dictionaryBlocks, dictionaryPlainText, type DictRun } from "./dictionaryText";
import { dictionaryLookups, EDITIONS, plural, type DictionaryEntry, type EnglishResults, type EtymologyItem } from "./explore";
import { ExploreAction, ExploreLinksContext, ExploreNotice, ExploreRow, ExploreSection, GlyphText, LoadError, LoadingLines, QuietButton, type ExploreDisclosure, type NoteCard } from "./ExploreParts";
import { useSharedResource } from "./useSharedResource";

function RunText({ run, onSee }: { run: DictRun; onSee: (term: string) => void }) {
  const { colors, scheme } = useTheme();
  const { onPath } = useContext(ExploreLinksContext);
  const style: TextStyle = {
    ...(run.bold || run.role === "col" || run.role === "sd" ? { fontFamily: fonts.sansSemiBold } : null),
    ...(run.italic || run.role === "cite" ? { fontStyle: "italic" } : null),
    ...(run.role === "cite" ? { color: colors.foregroundSoft } : null),
    ...(run.underline ? { textDecorationLine: "underline" } : null),
    ...(run.small || run.sup || run.sub ? { fontSize: 11 } : null),
    ...(run.role === "pos" ? { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.foregroundMuted } : null),
    ...(run.role === "icon" ? { fontSize: 10 } : null),
    ...(run.mark ? { backgroundColor: scheme === "dark" ? "rgba(251, 191, 36, 0.3)" : "rgba(252, 211, 77, 0.4)" } : null),
  };
  if (run.seeTerm) {
    const term = run.seeTerm;
    return (
      <Text accessibilityRole="button" accessibilityHint={`Looks up “${term}”`} onPress={() => onSee(term)} style={[style, { textDecorationLine: "underline", textDecorationStyle: "dotted", color: colors.foreground }]}>
        {run.text}
      </Text>
    );
  }
  if (run.href) {
    const href = run.href;
    const link: TextStyle = { color: scheme === "dark" ? "#7dd3fc" : "#0369a1", textDecorationLine: run.role === "icon" ? "none" : "underline" };
    if (href.startsWith("/")) {
      const path = toAppHref(href);
      return (
        <Text accessibilityRole="link" accessibilityHint="Opens the passage" onPress={() => onPath(path)} style={[style, link]}>
          {run.text}
        </Text>
      );
    }
    if (/^https?:\/\//i.test(href)) {
      return (
        <Text accessibilityRole="link" accessibilityHint="Opens in the browser" onPress={() => void openExternal(href)} style={[style, link]}>
          {run.text}
        </Text>
      );
    }
  }
  return <Text style={style}>{run.text}</Text>;
}

/** An entry's text as paragraphs, quotes and lists, its "See" references looking up their terms. */
export function DictionaryBody({ entryText, onSee }: { entryText: string; onSee: (term: string) => void }) {
  const { colors } = useTheme();
  const blocks = useMemo(() => dictionaryBlocks(entryText), [entryText]);
  if (!blocks.length) return null;
  const body: TextStyle = { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foreground };
  const runs = (items: DictRun[]) => items.map((run, index) => <RunText key={index} run={run} onSee={onSee} />);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          return (
            <View key={index} style={{ gap: 4, paddingLeft: 6 }}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={{ flexDirection: "row", gap: 6 }}>
                  <Text style={[body, { minWidth: 16, color: colors.foregroundMuted }]}>{block.ordered ? `${itemIndex + 1}.` : "•"}</Text>
                  <Text style={[body, { flex: 1 }]}>{runs(item)}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.kind === "quote") {
          return (
            <Text key={index} style={[body, { fontStyle: "italic", borderLeftWidth: 2, borderLeftColor: colors.surfaceBorder, paddingLeft: 12 }]}>
              {runs(block.runs)}
            </Text>
          );
        }
        return (
          <Text key={index} style={body}>
            {runs(block.runs)}
          </Text>
        );
      })}
    </View>
  );
}

/** "See X": X's entries in every edition, in place under the entry that named it (the web's "See" overlay). */
function SeeEntries({ term, onSee, onClose }: { term: string; onSee: (term: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [state, retry] = useSharedResource(dictionaryLookups, term.toLowerCase());
  const groups =
    state.status === "ready"
      ? EDITIONS.map((edition) => ({ edition, label: state.data.providerLabels?.[edition] || "Dictionary source", rows: state.data.byEdition?.[edition]?.entries ?? [] })).filter((group) => group.rows.length)
      : [];
  return (
    <View testID="dictionary-see" style={{ gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground }}>{`See: ${term}`}</Text>
        <QuietButton label="Close" accessibilityLabel={`Close “${term}”`} onPress={onClose} />
      </View>
      {state.status === "loading" || state.status === "idle" ? <LoadingLines label={`Looking up ${term}…`} /> : null}
      {state.status === "error" ? <LoadError message={`Unable to load dictionary entry. ${state.message}`} onRetry={retry} /> : null}
      {state.status === "ready" && !groups.length ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundMuted }}>No dictionary entry found.</Text> : null}
      {groups.map((group) => (
        <View key={group.edition} style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>{group.label}</Text>
          {group.rows.map((entry) => (
            <View key={entry.id} style={{ gap: 4 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground }}>
                {entry.word}
                {entry.pronounce ? <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>{`  ${entry.pronounce}`}</Text> : null}
              </Text>
              {entry.heading ? <Text style={{ fontFamily: fonts.sans, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.foregroundMuted }}>{entry.heading}</Text> : null}
              <DictionaryBody entryText={entry.entryText} onSee={onSee} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function AddToNote({ card, kind }: { card: () => NoteCard; kind: "dictionary" | "etymology" }) {
  const { onAddToNote } = useContext(ExploreLinksContext);
  return <ExploreAction label="Add to note" hint={`Starts a journal entry with this ${kind} card`} onPress={() => onAddToNote(card())} testID={`add-to-note-${kind}`} />;
}

function DictionaryEntryCard({ entry, source }: { entry: DictionaryEntry; source: string }) {
  const { colors } = useTheme();
  const [see, setSee] = useState<string | null>(null);
  const meta = [entry.pronounce, entry.heading].filter(Boolean).join(" · ") || null;
  return (
    <View style={{ gap: 8 }}>
      {meta ? <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>{meta}</Text> : null}
      <DictionaryBody entryText={entry.entryText} onSee={setSee} />
      {see ? <SeeEntries key={see} term={see} onSee={setSee} onClose={() => setSee(null)} /> : null}
      <AddToNote kind="dictionary" card={() => ({ word: entry.word?.trim() || "Dictionary entry", meta, text: dictionaryPlainText(entry.entryText), source })} />
    </View>
  );
}

function EtymologyCard({ item }: { item: EtymologyItem }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foreground }}>{item.text}</Text>
      <AddToNote kind="etymology" card={() => ({ word: item.word?.trim() || "Etymology", meta: null, text: item.text?.trim() || "", source: `Word history · ${item.source?.trim() || "Etymology"}` })} />
    </View>
  );
}

/** The English dictionary and word-history results, in whichever state the lookup is in; nothing once both are empty. */
export function EnglishMeaningsSection({
  term,
  english,
  errorMessage,
  onRetry,
  disclosure,
}: {
  term: string;
  english: EnglishResults;
  errorMessage?: string;
  onRetry: () => void;
  disclosure: ExploreDisclosure;
}) {
  const { status, dictionaryGroups, etymologyItems } = english;
  if (status === "empty") return null;
  const entryCount = dictionaryGroups.reduce((total, group) => total + group.rows.length, 0) + etymologyItems.length;
  const parts = status === "found" ? [dictionaryGroups.length ? "Definitions" : null, etymologyItems.length ? "Word history" : null].filter(Boolean) : ["Definitions", "Word history"];
  return (
    <ExploreSection
      tone="clay"
      icon={<GlyphText>Aa</GlyphText>}
      title="English meanings"
      summary={parts.join(" · ")}
      status={status}
      count={entryCount ? plural(entryCount, "entry", "entries") : null}
      disclosure={disclosure}
      testID="explore-section-english"
    >
      {status === "loading" ? (
        <ExploreNotice>
          <LoadingLines label={`Looking up ${term}…`} />
        </ExploreNotice>
      ) : status === "error" ? (
        <ExploreNotice>
          <LoadError message={`We couldn’t load dictionary entries for this word. ${errorMessage ?? "Check your connection and try again."}`} onRetry={onRetry} retryLabel="Try the dictionary again" />
        </ExploreNotice>
      ) : (
        <View>
          {dictionaryGroups.map((group) =>
            group.rows.map((entry, index) => (
              <ExploreRow key={entry.id} id={`dictionary:${entry.id}`} testID={`dictionary-row-${entry.id}`} label={group.rows.length > 1 ? `${group.source} · entry ${index + 1}` : group.source} title={entry.word}>
                <DictionaryEntryCard entry={entry} source={group.source} />
              </ExploreRow>
            ))
          )}
          {etymologyItems.map((item) => (
            <ExploreRow key={item.id} id={`etymology:${item.id}`} testID={`etymology-row-${item.id}`} label={`Word history · ${item.source}`} title={item.word}>
              <EtymologyCard item={item} />
            </ExploreRow>
          ))}
        </View>
      )}
    </ExploreSection>
  );
}
