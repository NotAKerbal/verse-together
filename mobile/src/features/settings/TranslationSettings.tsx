// Settings → Translations (the web's Bible translations section, BibleTranslationControls.tsx), for what the app
// does: it reads the King James Bible, bundled and offline, and compares selected verses with one other translation
// from the HelloAO Bible API (the selection menu's Translations). This shows that Bible and the remembered
// comparison, and changes or forgets it. The web's saved library, default Bible and side-by-side chapters aren't in
// the app.

import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { readJson, storage, writeJson } from "../../storage/kv";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { errorMessage } from "../explore/network";
import { loadTranslations, sortTranslations, type HelloaoTranslation } from "../explore/translations";
import { SmallIconButton, TextButton } from "./SettingsParts";

/** The key the selection menu's Translations sheet remembers its choice under (ExploreSheet.tsx). */
export const COMPARE_TRANSLATION_KEY = "vt_compare_translation_v1";

type Catalog = { status: "idle" | "loading" } | { status: "ready"; list: HelloaoTranslation[] } | { status: "error"; message: string };

function readSaved(): string | null {
  const value = readJson<unknown>(COMPARE_TRANSLATION_KEY, null);
  return typeof value === "string" && value.trim() ? value : null;
}

function describe(item: HelloaoTranslation | undefined, id: string) {
  return {
    title: item ? item.englishName ?? item.name : id,
    meta: [item?.languageEnglishName ?? item?.language, id, "Needs an internet connection"].filter(Boolean).join(" · "),
  };
}

/**
 * The HelloAO catalog, only while `wanted`: the list to choose from, and the remembered translation's name. Loaded
 * once per app run (loadTranslations keeps it); a failure is shown with Try again.
 */
function useCatalog(wanted: boolean) {
  const [catalog, setCatalog] = useState<Catalog>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    setCatalog({ status: "loading" });
    loadTranslations().then(
      (list) => live && setCatalog({ status: "ready", list }),
      (error) => live && setCatalog({ status: "error", message: errorMessage(error) }),
    );
    return () => {
      live = false;
    };
  }, [wanted, attempt]);
  return { catalog, retry: () => setAttempt((value) => value + 1) };
}

function Row({ title, meta, children, testID }: { title: string; meta: string; children?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>{title}</Text>
        <Text style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.foregroundMuted }}>{meta}</Text>
      </View>
      {children}
    </View>
  );
}

export default function TranslationSettings({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState<string | null>(readSaved);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { catalog, retry } = useCatalog(active && (choosing || saved !== null));
  const list = catalog.status === "ready" ? catalog.list : [];
  const current = saved ? describe(list.find((item) => item.id === saved), saved) : null;

  const save = (id: string | null) => {
    try {
      if (id) writeJson(COMPARE_TRANSLATION_KEY, id);
      else storage().removeItem(COMPARE_TRANSLATION_KEY);
      setSaved(id);
      setChoosing(false);
      setQuery("");
      setError(null);
    } catch {
      setError("Couldn't save this on the device. Try again.");
    }
  };

  const border = { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.card } as const;
  const muted = { fontFamily: fonts.sans, fontSize: 0.75 * REM, lineHeight: 0.75 * REM * 1.6, color: colors.foregroundMuted } as const;

  return (
    <View style={{ gap: 0.75 * REM, paddingVertical: 0.25 * REM }}>
      <View accessibilityLabel="Your Bible" style={border}>
        <Row title="King James Bible (LDS edition)" meta="English · Available offline">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground, textDecorationLine: "underline" }}>Default</Text>
        </Row>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.surfaceBorder }}>
          {current && saved ? (
            <Row title={current.title} meta={`Compare with · ${current.meta}`} testID="compare-translation">
              <TextButton label="Change" accessibilityLabel={`Change the comparison translation, ${current.title}`} onPress={() => setChoosing(!choosing)} />
              <SmallIconButton icon="trash" label={`Stop comparing with ${current.title}`} onPress={() => save(null)} />
            </Row>
          ) : (
            <Row title="No comparison translation" meta="Choose one to read selected verses beside the King James text." testID="compare-translation-none" />
          )}
        </View>
      </View>

      {choosing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="Find a translation"
            placeholder="Find a translation or language"
            placeholderTextColor={colors.foregroundSoft}
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.inputSurface, color: colors.foreground, fontFamily: fonts.sans, fontSize: 16 }}
          />
          {catalog.status === "loading" ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.foregroundMuted} />
              <Text style={muted}>Loading translations…</Text>
            </View>
          ) : null}
          {catalog.status === "error" ? (
            <View accessibilityRole="alert" style={{ gap: 8 }}>
              <Text style={muted}>{catalog.message}</Text>
              <TextButton label="Try again" onPress={retry} />
            </View>
          ) : null}
          {catalog.status === "ready" ? (
            <ScrollView style={[border, { maxHeight: 360 }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {sortTranslations(list, query)
                .slice(0, 80)
                .map((item) => {
                  const { title, meta } = describe(item, item.id);
                  const selected = item.id === saved;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Compare with ${title}`}
                      accessibilityState={{ selected }}
                      onPress={() => save(item.id)}
                      style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: pressed || selected ? colors.surfaceButtonHover : "transparent" })}
                    >
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>{title}</Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.foregroundSoft }}>{meta}</Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: "row" }}>
            <TextButton label="Cancel" onPress={() => setChoosing(false)} />
          </View>
        </View>
      ) : saved ? null : (
        <Pressable
          testID="choose-compare-translation"
          accessibilityRole="button"
          onPress={() => setChoosing(true)}
          style={({ pressed }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.md, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.background })}
        >
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>+ Choose a translation to compare</Text>
        </Pressable>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={[muted, { color: colors.accentRubric }]}>
          {error}
        </Text>
      ) : null}
      <Text style={muted}>Select verses in a Bible chapter and choose Translations to read them beside the King James text. Translations come from the HelloAO Free Use Bible API.</Text>
    </View>
  );
}
