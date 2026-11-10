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

export function LexiconResults({ lookup }: { lookup: StrongsLookup }) {
  const { colors } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const { matches, term, language } = lookup;
  const label = LANGUAGE_LABELS[language];
  const shown = showAll ? matches : matches.slice(0, SHOWN_FIRST);
  const groups = [
    { id: "kjv", heading: `translated “${term}” in the KJV`, rows: shown.filter((match) => match.matchedIn === "kjv") },
    { id: "definition", heading: `definitions that mention “${term}”`, rows: shown.filter((match) => match.matchedIn === "definition") },
  ].filter((group) => group.rows.length > 0);

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
    </View>
  );
}

function LexiconSearchLink({ language, term }: { language: BiblicalLanguage; term: string }) {
  return <ExternalLink url={bibleHubLexiconSearchUrl(language, term)} label={`Search Bible Hub’s ${LANGUAGE_LABELS[language]} lexicon`} a11y={`Search Bible Hub’s ${LANGUAGE_LABELS[language]} lexicon for “${term}”`} />;
}

function LexiconPanel({ language, term, state, retry }: { language: BiblicalLanguage; term: string; state: ResourceState<StrongsLookup>; retry: () => void }) {
  if (state.status === "ready") {
    return <LexiconResults lookup={state.data} />;
  }
  return (
    <ExploreNotice>
      {state.status === "error" ? (
        <LoadError message={`${LANGUAGE_LABELS[language]} lexicon entries didn’t load. ${state.message}`} onRetry={retry} retryLabel={`Try the ${LANGUAGE_LABELS[language]} lexicon again`}>
          <LexiconSearchLink language={language} term={term} />
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
      <View style={{ gap: 8 }}>
        {offered.map((option) => (
          <LexiconPanel key={option.key} language={option.key} term={term} state={option.state} retry={option.retry} />
        ))}
      </View>
      {offered.length ? (
        <LanguagesDetails term={term} interlinear={interlinear} languages={offered} />
      ) : interlinear ? (
        <InterlinearRow interlinear={interlinear} />
      ) : null}
    </ExploreSection>
  );
}

function LanguagesDetails({ term, interlinear, languages }: { term: string; interlinear: BibleInterlinearLink | null; languages: LexiconResult[] }) {
  const { colors } = useTheme();
  const palette = useTone();
  const [open, setOpen] = useState(false);
  const searchable = languages.filter(({ state }) => state.status !== "error");
  const loaded = languages.flatMap(({ key, state }) => (state.status === "ready" ? [{ key, lookup: state.data }] : []));
  const small = { fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color: colors.foregroundMuted };
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        testID="explore-languages-details-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? palette.rowPressed : "transparent" })}
      >
        <Text style={[small, { fontFamily: fonts.sansMedium }]}>Sources & details</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={11} color={colors.foregroundMuted} />
      </Pressable>
      {open ? (
        <View testID="explore-languages-details" style={{ gap: 4 }}>
          <Text style={[small, { paddingHorizontal: 10 }]}>Possible translations for this word in Greek or Hebrew.</Text>
          {searchable.length ? (
            <View style={{ paddingHorizontal: 10, flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
              {searchable.map(({ key }) => (
                <LexiconSearchLink key={key} language={key} term={term} />
              ))}
            </View>
          ) : null}
          {interlinear ? <InterlinearRow interlinear={interlinear} /> : null}
          {loaded.map(({ key, lookup }) => (
            <Text key={key} style={[small, { paddingHorizontal: 10, lineHeight: 18 }]}>
              {`${lookup.attribution.title}, from `}
              <Text accessibilityRole="link" onPress={() => void openExternal(lookup.attribution.sourceUrl)} style={{ textDecorationLine: "underline" }}>
                OpenScriptures
              </Text>
              {` (${lookup.attribution.license.replace(/\s*\(.*\)$/, "")})`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
