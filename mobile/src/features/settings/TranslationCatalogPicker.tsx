// Add a Bible (src/components/TranslationCatalogPicker.tsx): the HelloAO Free Use Bible API's whole library, searched
// and sorted by the web's own rules (src/lib/translationCatalog.ts). It opens on a short list of modern English
// Bibles; a search, "Browse all English Bibles" or another language shows the rest, a page at a time. Bibles that
// need a publisher's license say so when searched for. The list loads once per app run (features/explore/translations.ts)
// and a failure is shown with Try again.

import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  ALL_LANGUAGES,
  DEFAULT_CATALOG_LANGUAGE,
  FEATURED_BIBLES,
  catalogLanguages,
  filterTranslationCatalog,
  isLicensedOnlyQuery,
  languageDisplayName,
  searchCatalogLanguages,
  translationLanguage,
  translationNativeName,
  translationTitle,
} from "@/lib/translationCatalog";
import type { SavedBible } from "../../storage/bibleLibrary";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { errorMessage } from "../explore/network";
import { loadTranslations, type HelloaoTranslation } from "../explore/translations";

const PAGE_SIZE = 40;
const LANGUAGE_PAGE_SIZE = 40;

type CatalogState = { status: "idle" | "loading" } | { status: "ready"; list: HelloaoTranslation[] } | { status: "error"; message: string };

/** The library, only while `wanted`; `retry` asks again after a failure. */
export function useTranslationCatalog(wanted = true) {
  const [state, setState] = useState<CatalogState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // Queue the external request’s loading state so the effect does not synchronously cascade renders.
    void Promise.resolve().then(() => {
      if (live) setState({ status: "loading" });
    });
    loadTranslations().then(
      (list) => live && setState({ status: "ready", list }),
      (error) => live && setState({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      live = false;
    };
  }, [wanted, attempt]);
  return {
    catalog: state.status === "ready" ? state.list : null,
    error: state.status === "error" ? state.message : null,
    loading: state.status === "loading",
    retry: () => setAttempt((value) => value + 1),
  };
}

type Row = { item: HelloaoTranslation; title: string; abbreviation?: string };

function toRow(item: HelloaoTranslation): Row {
  const featured = FEATURED_BIBLES.find((entry) => entry.id === item.id);
  return featured ? { item, title: featured.label, abbreviation: featured.shortLabel } : { item, title: translationTitle(item), abbreviation: item.shortName };
}

function featuredRows(catalog: HelloaoTranslation[] | null): Row[] {
  return FEATURED_BIBLES.map((featured) => ({
    item: catalog?.find((entry) => entry.id === featured.id) ?? { id: featured.id, name: featured.label, language: "eng", languageEnglishName: "English" },
    title: featured.label,
    abbreviation: featured.shortLabel,
  }));
}

function useStyles() {
  const { colors } = useTheme();
  return {
    colors,
    input: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.inputSurface,
      color: colors.foreground,
      fontFamily: fonts.sans,
      fontSize: 16,
    },
    list: { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.card, overflow: "hidden" as const },
    muted: { fontFamily: fonts.sans, fontSize: 0.75 * REM, lineHeight: 0.75 * REM * 1.5, color: colors.foregroundMuted },
    button: {
      minHeight: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surfaceCard,
    },
  };
}

function BibleRow({ row, added, showLanguage, first, onAdd }: { row: Row; added: boolean; showLanguage: boolean; first: boolean; onAdd: (bible: SavedBible) => void }) {
  const { colors, muted } = useStyles();
  const { item, title, abbreviation } = row;
  const language = translationLanguage(item);
  const subtitle = [abbreviation, translationNativeName(item, title), showLanguage ? language : ""].filter(Boolean).join(" · ");
  return (
    <View testID={`catalog-bible-${item.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.surfaceBorder }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>{title}</Text>
        {subtitle ? <Text style={[muted, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={added ? `${title} added` : `Add ${title}`}
        accessibilityState={{ disabled: added }}
        disabled={added}
        onPress={() => onAdd({ id: item.id, label: title, language, abbreviation })}
        style={({ pressed }) => ({
          minHeight: 36,
          minWidth: 56,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
          borderRadius: radii.md,
          borderWidth: added ? 0 : 1,
          borderColor: colors.surfaceBorder,
          backgroundColor: added ? "transparent" : pressed ? colors.surfaceButtonHover : colors.surfaceCard,
        })}
      >
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: added ? colors.foregroundSoft : colors.foreground }}>{added ? "Added" : "Add"}</Text>
      </Pressable>
    </View>
  );
}

function LanguageChooser({ languages, current, onChoose }: { languages: ReturnType<typeof catalogLanguages>; current: string; onChoose: (id: string) => void }) {
  const { colors, input, list, muted, button } = useStyles();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(LANGUAGE_PAGE_SIZE);
  const matches = useMemo(() => searchCatalogLanguages(languages, query), [languages, query]);
  const showAll = "all languages".startsWith(query.trim().toLowerCase());
  const options = [...(showAll ? [{ id: ALL_LANGUAGES, label: "All languages" }] : []), ...matches];
  return (
    <View style={{ gap: 12 }}>
      <TextInput
        accessibilityLabel="Find a language"
        placeholder="Search languages, e.g. Spanish or español"
        placeholderTextColor={colors.foregroundSoft}
        autoCorrect={false}
        autoCapitalize="none"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setLimit(LANGUAGE_PAGE_SIZE);
        }}
        onSubmitEditing={() => options[0] && onChoose(options[0].id)}
        style={input}
      />
      {options.length ? (
        <View accessibilityLabel="Languages" style={list}>
          {options.slice(0, limit).map((item, index) => {
            const selected = item.id === current;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChoose(item.id)}
                style={({ pressed }) => ({
                  minHeight: 46,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingHorizontal: 14,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors.surfaceBorder,
                  backgroundColor: pressed ? colors.surfaceButtonHover : "transparent",
                })}
              >
                <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 0.875 * REM, color: colors.foreground }}>{languageDisplayName(item)}</Text>
                {selected ? <Text style={{ color: colors.foreground }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={muted}>{`No language matches “${query.trim()}”.`}</Text>
      )}
      {options.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setLimit(limit + LANGUAGE_PAGE_SIZE)} style={button}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground }}>Show more</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  savedIds: string[];
  onAdd: (bible: SavedBible) => void;
  /** The language chooser replaces the list while open; the editor owns this so its Back can close it. */
  choosingLanguage: boolean;
  onChoosingLanguageChange: (open: boolean) => void;
};

export default function TranslationCatalogPicker({ savedIds, onAdd, choosingLanguage, onChoosingLanguageChange }: Props) {
  const { colors, input, list, muted, button } = useStyles();
  const { catalog, error, loading, retry } = useTranslationCatalog();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(DEFAULT_CATALOG_LANGUAGE);
  const [browsing, setBrowsing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const savedSet = new Set(savedIds.map((id) => id.toLowerCase()));
  const languages = useMemo(() => catalogLanguages(catalog ?? []), [catalog]);
  const matches = useMemo(() => filterTranslationCatalog(catalog ?? [], language, query), [catalog, language, query]);
  const otherLanguageMatches = useMemo(
    () => (language === ALL_LANGUAGES || !query.trim() ? 0 : filterTranslationCatalog(catalog ?? [], ALL_LANGUAGES, query).length),
    [catalog, language, query],
  );

  const languageName =
    language === ALL_LANGUAGES ? "All languages" : (languages.find((item) => item.id === language)?.label ?? (language === DEFAULT_CATALOG_LANGUAGE ? "English" : language));
  const featuredOnly = language === DEFAULT_CATALOG_LANGUAGE && !query.trim() && !browsing;
  const rows = featuredOnly ? featuredRows(catalog) : matches.map(toRow);
  const shown = featuredOnly ? rows : rows.slice(0, limit);

  const chooseLanguage = (next: string) => {
    setLanguage(next);
    setLimit(PAGE_SIZE);
    onChoosingLanguageChange(false);
  };

  if (choosingLanguage && catalog) return <LanguageChooser languages={languages} current={language} onChoose={chooseLanguage} />;

  return (
    <View style={{ gap: 12 }}>
      <TextInput
        accessibilityLabel="Search Bibles"
        placeholder="Search by name or abbreviation"
        placeholderTextColor={colors.foregroundSoft}
        autoCorrect={false}
        autoCapitalize="none"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setLimit(PAGE_SIZE);
        }}
        style={input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Language: ${languageName}. Change language`}
        accessibilityState={{ disabled: !catalog }}
        disabled={!catalog}
        onPress={() => onChoosingLanguageChange(true)}
        style={({ pressed }) => [button, { flexDirection: "row", justifyContent: "space-between", opacity: catalog ? 1 : 0.6, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard }]}
      >
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 0.875 * REM, color: colors.foregroundMuted }}>
          {"Language: "}
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.foreground }}>{languageName}</Text>
        </Text>
        <Text style={muted}>Change ›</Text>
      </Pressable>

      {rows.length ? (
        <Text style={muted}>
          {featuredOnly ? "Featured English Bibles" : `${rows.length} ${rows.length === 1 ? "Bible" : "Bibles"}${language === ALL_LANGUAGES ? " in all languages" : ` in ${languageName}`}`}
        </Text>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={[list, { padding: 12, gap: 8 }]}>
          <Text style={muted}>{`The full list of Bibles couldn’t load. ${error}`}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={[button, { alignSelf: "flex-start" }]}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {shown.length ? (
        <View accessibilityLabel="Bibles" style={list}>
          {shown.map((row, index) => (
            <BibleRow key={row.item.id} row={row} first={index === 0} added={savedSet.has(row.item.id.toLowerCase())} showLanguage={language === ALL_LANGUAGES} onAdd={onAdd} />
          ))}
        </View>
      ) : null}

      {loading && !featuredOnly ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator color={colors.foregroundMuted} />
          <Text style={muted}>Loading Bibles…</Text>
        </View>
      ) : null}

      {featuredOnly && catalog ? (
        <Pressable accessibilityRole="button" onPress={() => setBrowsing(true)} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground, textDecorationLine: "underline" }}>Browse all English Bibles</Text>
        </Pressable>
      ) : null}
      {!featuredOnly && rows.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setLimit(limit + PAGE_SIZE)} style={button}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground }}>Show more</Text>
        </Pressable>
      ) : null}

      {catalog && !rows.length ? (
        <View accessibilityRole="summary" style={[list, { borderStyle: "dashed", padding: 14, gap: 8 }]}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 0.875 * REM, color: colors.foreground }}>
            {`No Bibles match “${query.trim()}”${language === ALL_LANGUAGES ? "" : ` in ${languageName}`}.`}
          </Text>
          {isLicensedOnlyQuery(query) ? <Text style={muted}>NRSVue, NIV, NLT, CSB and ESV need a publisher’s license, so they aren’t available here.</Text> : null}
          {otherLanguageMatches ? (
            <Pressable accessibilityRole="button" onPress={() => chooseLanguage(ALL_LANGUAGES)} style={{ minHeight: 36, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground, textDecorationLine: "underline" }}>Search all languages</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
