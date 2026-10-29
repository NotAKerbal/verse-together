// Explore (the web's WordStudyPanel, as the reader's and lessons' Explore sidebar opens it) and Translations (compare
// the wording) for a verse selection. Explore looks up exactly the selected words, a phrase kept whole, and can
// narrow to one of its words. Each source shows its own loading state and error with Try again; leaving a selection
// or closing the sheet cancels its requests, and nothing is filled in when the network is unavailable.

import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { EXPLORE_COLLAPSED, lookupStatus, nextExploreOpen, sectionStatus, type ExploreSectionKey } from "@/lib/exploreSources";
import type { WordStudyContext } from "@/lib/wordStudySources";
import Sheet from "../../components/Sheet";
import { Button, Notice, Txt } from "../../components/ui";
import type { Verse } from "../../data/scripture";
import { scriptureSource } from "../../shared/web";
import { readJson, writeJson } from "../../storage/kv";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { setDraftIntent } from "../journal/draftIntent";
import { EnglishMeaningsSection } from "./EnglishSources";
import {
  biblicalLanguagePlan,
  dictionaryLookups,
  englishResults,
  explorePhrase,
  exploreTerm,
  exploreWords,
  languagesStatus,
  LEXICON_MAX_TERM,
  lexiconKey,
  lexiconLookups,
  noMatches,
  type LookupState,
  type NoMatch,
} from "./explore";
import { ExploreLinksContext, ExternalLink, type ExploreDisclosure, type ExploreLinks, type NoteCard } from "./ExploreParts";
import { BiblicalLanguagesSection, type LexiconResult } from "./LanguageSources";
import { errorMessage } from "./network";
import { ScriptureHelpsSection, useVisibleStudyHelps } from "./StudyHelpSources";
import { loadComparison, loadTranslations, normalizeCompareText, sortTranslations, type HelloaoTranslation } from "./translations";
import { useSharedResource } from "./useSharedResource";

type Load<T> = { status: "idle" } | { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

function useLoad<T>(load: (() => Promise<T>) | null, key: string) {
  const [state, setState] = useState<Load<T>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!load) {
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    load().then(
      (data) => live && setState({ status: "ready", data }),
      (error) => live && setState({ status: "error", message: errorMessage(error) })
    );
    return () => {
      live = false;
    };
    // `key` names the request; `load` is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <ActivityIndicator color={colors.foregroundMuted} />
      <Txt style={{ color: colors.foregroundMuted }}>{label}</Txt>
    </View>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Notice tone="warning">{message}</Notice>
      <Button variant="secondary" label="Try again" style={{ alignSelf: "flex-start" }} onPress={onRetry} />
    </View>
  );
}

/** Where the selection was read: the chapter (for passage sources such as the interlinear) and its verses. */
export type ExploreContext = WordStudyContext & { verses?: readonly number[]; verseCount?: number };

/** The sources that had nothing, so hiding them never hides that they were checked. */
function NoMatchesList({ term, sources }: { term: string; sources: NoMatch[] }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <View testID="explore-no-matches" style={{ borderRadius: 14, backgroundColor: colors.surfaceCardSoft, paddingHorizontal: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.foregroundMuted }}>
          {`No matches for “${term}” in ${sources.length} ${sources.length === 1 ? "source" : "sources"}`}
        </Text>
        <Text accessible={false} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open
        ? sources.map((source, index) => (
            <View key={source.id} style={{ minHeight: 36, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.surfaceBorder }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.foreground }}>{source.label}</Text>
              {source.link ? <ExternalLink url={source.link.url} label={source.link.text} a11y={source.link.a11y} /> : null}
            </View>
          ))
        : null}
    </View>
  );
}

/** Every source for one term (the web's WordStudyLookup): a new term starts with fresh loading states. */
function ExploreLookup({ term, context }: { term: string; context?: ExploreContext | null }) {
  const { colors } = useTheme();
  const tooLong = term.length > LEXICON_MAX_TERM;

  const [dictionary, retryDictionary] = useSharedResource(dictionaryLookups, tooLong ? null : term);
  const lookup: LookupState = tooLong
    ? { status: "ready", payload: { ok: true, enabled: true } }
    : dictionary.status === "ready"
      ? { status: "ready", payload: dictionary.data }
      : dictionary.status === "error"
        ? { status: "error", message: dictionary.message }
        : { status: "loading" };
  const english = englishResults(lookup);

  // None for Other denominations, so "no matches" and "nothing found" count only the sources shown.
  const helps = useVisibleStudyHelps(term);
  const helpsStatus = sectionStatus(helps.map((result) => result.status));

  const plan = biblicalLanguagePlan(term, context);
  const [hebrew, retryHebrew] = useSharedResource(lexiconLookups, plan.searchable ? lexiconKey("hebrew", plan.term) : null);
  const [greek, retryGreek] = useSharedResource(lexiconLookups, plan.searchable ? lexiconKey("greek", plan.term) : null);
  const hasMatches = (data: { matches: unknown[] }) => data.matches.length > 0;
  const results: Record<"hebrew" | "greek", LexiconResult> = {
    hebrew: { key: "hebrew", status: plan.searchable ? lookupStatus(hebrew, hasMatches) : "empty", state: hebrew, retry: retryHebrew },
    greek: { key: "greek", status: plan.searchable ? lookupStatus(greek, hasMatches) : "empty", state: greek, retry: retryGreek },
  };
  const languages = plan.order.map((key) => results[key]);
  const lexStatus = languagesStatus(languages.map((result) => result.status), plan.interlinear);

  const nothingFound = sectionStatus([helpsStatus, lexStatus, english.status]) === "empty";
  const [openState, toggle] = useReducer(nextExploreOpen, EXPLORE_COLLAPSED);
  const disclosure = (section: ExploreSectionKey): ExploreDisclosure => ({
    open: openState.section === section,
    openRow: openState.section === section ? openState.row : null,
    onToggle: () => toggle({ type: "toggleSection", section }),
    onToggleRow: (row) => toggle({ type: "toggleRow", row }),
  });
  const missing = noMatches({ helps, languages, lexicon: plan, english, englishSearched: !tooLong });

  return (
    <View style={{ gap: 10 }} accessibilityLabel={`Sources for ${term}`}>
      {nothingFound ? (
        <View style={{ gap: 4 }} accessibilityLiveRegion="polite" testID="explore-nothing">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.foreground }}>{`Nothing found for “${term}”.`}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foregroundMuted }}>
            {tooLong
              ? "This selection is too long to look up as one phrase. Choose one of its words above, or search the sources below."
              : "None of our sources have this word. Try selecting its base form, or search the sources below."}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <ScriptureHelpsSection helps={helps} status={helpsStatus} disclosure={disclosure("helps")} />
          <BiblicalLanguagesSection term={plan.term} interlinear={plan.interlinear} languages={languages} status={lexStatus} disclosure={disclosure("languages")} />
          <EnglishMeaningsSection term={term} english={english} errorMessage={lookup.status === "error" ? lookup.message : undefined} onRetry={retryDictionary} disclosure={disclosure("english")} />
        </View>
      )}
      <NoMatchesList term={term} sources={missing} />
    </View>
  );
}

/** The selection's words as choices: the whole selection first, then each word worth exploring on its own. */
function TermChoices({ phrase, words, chosen, onChoose }: { phrase: string; words: string[]; chosen: string | null; onChoose: (word: string | null) => void }) {
  const { colors } = useTheme();
  const options: Array<{ key: string; label: string; word: string | null; a11y: string }> = [
    { key: "whole", label: "Whole selection", word: null, a11y: `Explore the whole selection, “${phrase}”` },
    ...words.map((word) => ({ key: word.toLowerCase(), label: word, word, a11y: `Explore “${word}”` })),
  ];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.foregroundMuted }}>Or explore one word</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
        {options.map((option) => {
          const active = option.word === chosen;
          return (
            <Pressable
              key={option.key}
              testID={`explore-choice-${option.key}`}
              accessibilityRole="button"
              accessibilityLabel={option.a11y}
              accessibilityState={{ selected: active }}
              onPress={() => onChoose(option.word)}
              style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: active ? colors.surfaceButtonActive : colors.surfaceButton }}
            >
              <Text style={{ fontFamily: option.word ? fonts.serif : fonts.sansMedium, fontSize: option.word ? 16 : 13, color: active ? colors.surfaceButtonActiveText : colors.foreground }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ExploreBody({ phrase, reference, context }: { phrase: string; reference: string; context?: ExploreContext | null }) {
  const { colors } = useTheme();
  const words = useMemo(() => exploreWords(phrase), [phrase]);
  const [chosen, setChosen] = useState<string | null>(null);
  const subject = chosen ?? phrase;
  const term = exploreTerm(subject);
  // A one-word selection (or one with a single word worth exploring on its own) needs no choices.
  const offerWords = words.length > 1 || (words.length === 1 && words[0].toLowerCase() !== exploreTerm(phrase));
  return (
    <>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: colors.accentRubric }}>{reference}</Text>
        <Text testID="explore-subject" accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, color: colors.foreground }}>
          {subject}
        </Text>
      </View>
      {offerWords ? <TermChoices phrase={phrase} words={words} chosen={chosen} onChoose={setChosen} /> : null}
      {term ? <ExploreLookup key={term} term={term} context={context} /> : null}
    </>
  );
}

export function ExploreSheet({
  visible,
  onClose,
  text,
  reference,
  context,
}: {
  visible: boolean;
  onClose: () => void;
  /** Exactly the selected words (a partial first or last verse as selected), kept whole. */
  text: string;
  /** The selection's reference, as the selection menu names it ("Lamentations 3:22–23"). */
  reference: string;
  context?: ExploreContext | null;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const phrase = explorePhrase(text);
  const onPath = useCallback(
    (path: string) => {
      onClose();
      router.push(path as never);
    },
    [onClose, router]
  );
  const contextKey = context ? `${context.volume}/${context.book}/${context.chapter}:${context.verses?.join(",") ?? ""}` : "";
  const onAddToNote = useCallback(
    (card: NoteCard) => {
      const verses = context?.verses?.length ? [...context.verses].sort((a, b) => a - b) : null;
      setDraftIntent({
        source:
          context && verses
            ? scriptureSource({ volume: context.volume, book: context.book, chapter: context.chapter, verseStart: verses[0], verseEnd: verses[verses.length - 1], reference })
            : null,
        body: `### ${card.word}\n\n${card.meta ? `*${card.meta}*\n\n` : ""}${card.text}\n\n— ${card.source}\n\n`,
        reading: false,
        ...(context?.verseCount ? { verseCount: context.verseCount } : null),
      });
      onClose();
      router.push("/notes/new" as never);
    },
    // contextKey names the context; the object is rebuilt by each render of the selection menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey, reference, onClose, router]
  );
  const links = useMemo<ExploreLinks>(() => ({ onPath, onAddToNote }), [onPath, onAddToNote]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Explore" testID="explore-sheet">
      <ExploreLinksContext.Provider value={links}>
        {/* Mounted only while open: closing (or a new selection) cancels its requests and starts the next one fresh. */}
        {visible ? (
          phrase ? (
            <ExploreBody key={`${contextKey}|${phrase}`} phrase={phrase} reference={reference} context={context} />
          ) : (
            <Txt style={{ color: colors.foregroundMuted }}>Select a word or phrase to explore.</Txt>
          )
        ) : null}
      </ExploreLinksContext.Provider>
      <Txt style={{ fontSize: 11.5, lineHeight: 17, color: colors.foregroundSoft }}>
        Study helps from churchofjesuschrist.org; Strong’s Hebrew and Greek from OpenScriptures; definitions and word histories from public dictionaries, through Verse Together. Topic matching works offline; the rest needs an internet connection.
      </Txt>
    </Sheet>
  );
}

const TRANSLATION_KEY = "vt_compare_translation_v1";

export function TranslationsSheet({ visible, onClose, book, chapter, verses, reference }: { visible: boolean; onClose: () => void; book: string; chapter: number; verses: Verse[]; reference: string }) {
  const { colors } = useTheme();
  const [translation, setTranslation] = useState<string | null>(() => readJson<string | null>(TRANSLATION_KEY, null));
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const list = useLoad<HelloaoTranslation[]>(visible && (choosing || !translation) ? loadTranslations : null, `list:${visible && (choosing || !translation)}`);
  const chapterLoad = useLoad(visible && translation && !choosing ? () => loadComparison(book, chapter, translation) : null, `${book}:${chapter}:${translation}:${visible && !choosing}`);
  const choose = (id: string) => {
    setTranslation(id);
    setChoosing(false);
    try {
      writeJson(TRANSLATION_KEY, id);
    } catch {
      // The choice still applies now; it just won't be remembered.
    }
  };
  const picking = choosing || !translation;
  return (
    <Sheet visible={visible} onClose={onClose} title="Translations" testID="translations-sheet">
      {picking ? (
        <View style={{ gap: 10 }}>
          <TextInput
            accessibilityLabel="Find a translation"
            placeholder="Find a translation or language"
            placeholderTextColor={colors.foregroundSoft}
            value={query}
            onChangeText={setQuery}
            style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.inputSurface, color: colors.foreground, fontFamily: fonts.sans, fontSize: 16 }}
          />
          {list.state.status === "loading" ? <Loading label="Loading translations…" /> : null}
          {list.state.status === "error" ? <Failed message={list.state.message} onRetry={list.retry} /> : null}
          {list.state.status === "ready" ? (
            <ScrollView style={{ maxHeight: 380 }} nestedScrollEnabled>
              {sortTranslations(list.state.data, query)
                .slice(0, 80)
                .map((item) => (
                  <Pressable key={item.id} accessibilityRole="button" onPress={() => choose(item.id)} style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 6, borderRadius: 8, backgroundColor: pressed ? colors.surfaceButtonHover : "transparent" })}>
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: colors.foreground }}>{item.englishName ?? item.name}</Text>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{`${item.id} · ${item.languageEnglishName ?? item.language ?? ""}`}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          ) : null}
          {translation ? <Button variant="quiet" label="Cancel" style={{ alignSelf: "flex-start" }} onPress={() => setChoosing(false)} /> : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground }}>
              {chapterLoad.state.status === "ready" ? chapterLoad.state.data.translationName ?? translation : translation}
            </Text>
            <Button variant="secondary" label="Change" onPress={() => setChoosing(true)} />
          </View>
          {chapterLoad.state.status === "loading" ? <Loading label={`Loading ${reference}…`} /> : null}
          {chapterLoad.state.status === "error" ? <Failed message={chapterLoad.state.message} onRetry={chapterLoad.retry} /> : null}
          {chapterLoad.state.status === "ready"
            ? verses.map((verse) => {
                const other = chapterLoad.state.status === "ready" ? chapterLoad.state.data.verses.find((item) => item.verse === verse.verse) : undefined;
                const same = other && normalizeCompareText(other.text) === normalizeCompareText(verse.text);
                return (
                  <View key={verse.verse} style={{ gap: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.rule }}>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 25, color: colors.foregroundMuted }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.accentRubric }}>{`${verse.verse} KJV  `}</Text>
                      {verse.text}
                    </Text>
                    <Text style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 25, color: colors.foreground }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.accentGoal }}>{`${translation}  `}</Text>
                      {other ? (same ? "Same wording." : other.text) : "This translation has no text for this verse."}
                    </Text>
                  </View>
                );
              })
            : null}
          <Txt style={{ fontSize: 11.5, color: colors.foregroundSoft }}>Translations from the HelloAO Free Use Bible API. Needs an internet connection.</Txt>
        </View>
      )}
    </Sheet>
  );
}
