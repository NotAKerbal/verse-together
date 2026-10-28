// Explore's biblical languages (the web's BiblicalLanguagesSection and LexiconResults): Strong's Hebrew and Greek
// entries whose King James renderings or definitions use the selection, the language of the testament being read
// first, and the chapter's word-by-word interlinear when it is a Bible chapter. These are possibilities to explore,
// not the original word of the verse, and the section says so.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { SourceStatus } from "@/lib/exploreSources";
import { scriptRuns, STRONGS_LANG, type StrongsLookup, type StrongsMatch } from "@/lib/strongsLexicon";
import { bibleHubLexiconSearchUrl, type BibleInterlinearLink, type BiblicalLanguage } from "@/lib/wordStudySources";
import { openExternal } from "../../components/Blocks";
import { Icon } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { LANGUAGE_LABELS, plural } from "./explore";
import { Eyebrow, ExploreNotice, ExploreRow, ExploreSection, ExternalLink, GlyphText, LoadError, LoadingLines, QuietButton, useTone, type ExploreDisclosure } from "./ExploreParts";
import type { ResourceState } from "./useSharedResource";

const SHOWN_FIRST = 3;

export type LexiconResult = { key: BiblicalLanguage; status: SourceStatus; state: ResourceState<StrongsLookup>; retry: () => void };

/** Text with each Hebrew or Greek run kept whole, so it reads in its own direction without reordering the English. */
function MixedScript({ text }: { text: string }) {
  return scriptRuns(text).map((run, index) =>
    run.script ? (
      <Text key={index} style={{ writingDirection: STRONGS_LANG[run.script].dir }}>
        {run.text}
      </Text>
    ) : (
      run.text
    )
  );
}

function bibleHubEntryUrl(id: string): string {
  return `https://biblehub.com/${id.startsWith("H") ? "hebrew" : "greek"}/${id.slice(1)}.htm`;
}

/** A Strong's entry in full, under its title row: how it is said, what it means, and how the KJV renders it. */
function LexiconEntry({ match }: { match: StrongsMatch }) {
  const { colors } = useTheme();
  const small = { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.foregroundMuted };
  return (
    <View style={{ gap: 6 }}>
      {match.pronunciation ? <Text accessibilityLabel={`pronounced ${match.pronunciation}`} style={small}>{match.pronunciation}</Text> : null}
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foreground }}>
        <MixedScript text={match.definition} />
      </Text>
      {match.derivation ? (
        <Text style={small}>
          <MixedScript text={match.derivation} />
        </Text>
      ) : null}
      <Text style={[small, { color: colors.foreground }]}>
        <Text style={{ fontFamily: fonts.sansMedium }}>KJV renders it: </Text>
        <MixedScript text={match.kjv} />
      </Text>
      <ExternalLink url={bibleHubEntryUrl(match.id)} label={`${match.id} on Bible Hub`} />
    </View>
  );
}

/** A language's Strong's entries as title rows: the best few, the rest on request, and the source. */
export function LexiconResults({ lookup }: { lookup: StrongsLookup }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const { matches, term, language } = lookup;
  const label = LANGUAGE_LABELS[language];
  const shown = showAll ? matches : matches.slice(0, SHOWN_FIRST);
  // Words the KJV translates as the term come first; words whose definitions only mention it follow, apart.
  const groups = [
    { id: "kjv", heading: `translated “${term}” in the KJV`, rows: shown.filter((match) => match.matchedIn === "kjv") },
    { id: "definition", heading: `definitions that mention “${term}”`, rows: shown.filter((match) => match.matchedIn === "definition") },
  ].filter((group) => group.rows.length > 0);
  const license = lookup.attribution.license.replace(/\s*\(.*\)$/, "");

  return (
    <View style={{ gap: 4 }} testID={`lexicon-${language}`}>
      {matches.length > 0 ? (
        <>
          {groups.map((group) => (
            <View key={group.id}>
              <View style={{ paddingHorizontal: 10, paddingTop: 4 }}>
                <Eyebrow>{`${label} · ${group.heading}`}</Eyebrow>
              </View>
              {group.rows.map((match) => (
                <ExploreRow
                  key={match.id}
                  id={`${language}:${match.id}`}
                  testID={`lexicon-row-${match.id}`}
                  label={`${label} · ${match.id}`}
                  title={
                    <>
                      <Text style={{ fontSize: 18, writingDirection: STRONGS_LANG[language].dir }}>{match.lemma}</Text>
                      <Text style={{ fontSize: 15, fontStyle: "italic", color: colors.foregroundMuted }}>{`  ${match.transliteration}`}</Text>
                    </>
                  }
                >
                  <LexiconEntry match={match} />
                </ExploreRow>
              ))}
            </View>
          ))}
          {matches.length > SHOWN_FIRST ? (
            <View style={{ paddingHorizontal: 10, alignItems: "flex-start" }}>
              <QuietButton
                label={showAll ? "Show fewer" : `Show ${matches.length - SHOWN_FIRST} more`}
                accessibilityLabel={`${showAll ? "Show fewer" : `Show ${matches.length - SHOWN_FIRST} more`} ${label} entries`}
                expanded={showAll}
                onPress={() => setShowAll((value) => !value)}
              />
            </View>
          ) : null}
        </>
      ) : (
        <Text style={{ paddingHorizontal: 10, fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foregroundMuted }}>
          {`No ${label} entry in Strong’s dictionary uses “${term}” in its King James renderings or definition.`}
        </Text>
      )}
      <Text style={{ paddingHorizontal: 10, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: colors.foregroundMuted }}>
        {`${lookup.attribution.title}, from `}
        <Text accessibilityRole="link" onPress={() => void openExternal(lookup.attribution.sourceUrl)} style={{ textDecorationLine: "underline" }}>
          OpenScriptures
        </Text>
        {` (${license})`}
      </Text>
    </View>
  );
}

function LexiconPanel({ language, term, state, retry }: { language: BiblicalLanguage; term: string; state: ResourceState<StrongsLookup>; retry: () => void }) {
  const search = <ExternalLink url={bibleHubLexiconSearchUrl(language, term)} label={`Search Bible Hub’s ${LANGUAGE_LABELS[language]} lexicon`} a11y={`Search Bible Hub’s ${LANGUAGE_LABELS[language]} lexicon for “${term}”`} />;
  if (state.status === "ready") {
    return (
      <View>
        <LexiconResults lookup={state.data} />
        <View style={{ paddingHorizontal: 10 }}>{search}</View>
      </View>
    );
  }
  return (
    <ExploreNotice>
      {state.status === "error" ? (
        <LoadError message={`${LANGUAGE_LABELS[language]} lexicon entries didn’t load. ${state.message}`} onRetry={retry} retryLabel={`Try the ${LANGUAGE_LABELS[language]} lexicon again`}>
          {search}
        </LoadError>
      ) : (
        <LoadingLines label={`Looking up “${term}” in Strong’s ${LANGUAGE_LABELS[language]} dictionary…`} />
      )}
    </ExploreNotice>
  );
}

function InterlinearRow({ interlinear }: { interlinear: BibleInterlinearLink }) {
  const { colors } = useTheme();
  const palette = useTone();
  const source = `${interlinear.testament === "old" ? "Hebrew (and Aramaic)" : "Greek"} text, word by word with English · Bible Hub`;
  return (
    <Pressable
      testID="explore-interlinear"
      accessibilityRole="link"
      accessibilityLabel={`${interlinear.passage} interlinear. ${source}`}
      accessibilityHint="Opens in the browser"
      onPress={() => void openExternal(interlinear.url)}
      style={({ pressed }) => ({ marginTop: 4, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? palette.rowPressed : "transparent" })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.foregroundMuted }}>{source}</Text>
        <Text style={{ marginTop: 1, fontFamily: fonts.serif, fontSize: 16, lineHeight: 21, color: colors.foreground }}>{`${interlinear.passage} interlinear`}</Text>
      </View>
      <Icon name="arrow-up-right-from-square" size={11} color={colors.foregroundSoft} />
    </Pressable>
  );
}

/** Strong's entries in both languages, the testament's first, and the chapter's interlinear when there is one. */
export function BiblicalLanguagesSection({
  term,
  interlinear,
  languages,
  status,
  disclosure,
}: {
  term: string;
  interlinear: BibleInterlinearLink | null;
  languages: LexiconResult[];
  status: SourceStatus;
  disclosure: ExploreDisclosure;
}) {
  if (status === "empty") return null;
  const offered = languages.filter((language) => language.status !== "empty");
  const matchCount = offered.reduce((total, { state }) => total + (state.status === "ready" ? state.data.matches.length : 0), 0);
  const summary = [...offered.map(({ key }) => LANGUAGE_LABELS[key]), ...(interlinear ? [`${interlinear.passage} interlinear`] : [])].join(" · ");

  return (
    <ExploreSection
      tone="blue"
      icon={<GlyphText>αא</GlyphText>}
      title="Biblical languages"
      summary={summary}
      status={status}
      count={matchCount ? plural(matchCount, "match", "matches") : null}
      disclosure={disclosure}
      testID="explore-section-languages"
    >
      {offered.length ? <LanguagesCaution term={term} /> : null}
      <View style={{ gap: 8 }}>
        {offered.map((option) => (
          <LexiconPanel key={option.key} language={option.key} term={term} state={option.state} retry={option.retry} />
        ))}
      </View>
      {interlinear ? <InterlinearRow interlinear={interlinear} /> : null}
    </ExploreSection>
  );
}

function LanguagesCaution({ term }: { term: string }) {
  const color = useTone().accent;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 10, paddingBottom: 4 }}>
      <Icon name="circle-info" size={13} color={color} style={{ marginTop: 3 }} />
      <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color }}>
        <Text style={{ fontFamily: fonts.sansSemiBold }}>Possibilities to explore, not the word in this verse.</Text>
        {` Strong’s entries whose King James renderings or definitions use “${term}”.`}
      </Text>
    </View>
  );
}
