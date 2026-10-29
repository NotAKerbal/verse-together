// Your Bibles (src/components/BibleTranslationControls.tsx): the King James Bible bundled for offline reading, then
// the saved Bibles from the HelloAO library, each with Make default and Remove; + Add Bible opens the whole library.
// The default Bible is the main text of Bible chapters, and removing it makes the King James Bible the default again.
// In the reader's settings (`onShownChange` given) each Bible also has a Show switch that sets it beside the chapter;
// Bibles shown but not saved are listed too, with Save. The Joseph Smith Translation choice follows, for Latter-day
// Saint content only. All of it is kept on this device (storage/bibleLibrary.ts), as the web keeps it in the browser.

import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BIBLE_TRANSLATION_OPTIONS } from "@/lib/bibleCanon";
import { FEATURED_BIBLES, translationLanguage, translationTitle } from "@/lib/translationCatalog";
import { openExternal } from "../../components/Blocks";
import { Icon } from "../../components/ui";
import {
  JST_SOURCE_DOCS_URL,
  LDS_BIBLE_ID,
  baseBibleLabel,
  removeBible,
  sameBibleId,
  saveBible,
  setDefaultBible,
  useDefaultBible,
  useJstPreference,
  useSavedBibles,
  type SavedBible,
} from "../../storage/bibleLibrary";
import { useFaithTradition } from "../../storage/faithTradition";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { SettingSwitch, SmallIconButton } from "./SettingsParts";
import TranslationCatalogPicker, { useTranslationCatalog } from "./TranslationCatalogPicker";

type Props = {
  /** Chapter-only visibility (the reader's settings). Omit in Settings, where the saved library is managed. */
  shown?: string[];
  onShownChange?: (id: string, on: boolean) => void;
};

type EditorView = "list" | "catalog" | "language";
type ListRow = SavedBible & { saved: boolean; shown: boolean };

const NO_COMPARISONS: string[] = [];
const KNOWN_BIBLES: SavedBible[] = [
  ...FEATURED_BIBLES.map((item) => ({ id: item.id, label: item.label, language: "English", abbreviation: item.shortLabel })),
  ...BIBLE_TRANSLATION_OPTIONS.map((item) => ({ ...item, language: "English" })),
];
const TITLES: Record<EditorView, string> = { list: "Your Bibles", catalog: "Add a Bible", language: "Choose a language" };
const SAVE_FAILED = "This device couldn’t save that change. Try again.";

function LinkButton({ label, accessibilityLabel, selected, onPress, disabled }: { label: string; accessibilityLabel: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 8, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.75 * REM, color: colors.foreground, textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
}

function BibleList({
  rows,
  defaultBible,
  onDefault,
  onShow,
  onRemove,
  onSave,
  onAdd,
}: {
  rows: ListRow[];
  defaultBible: string;
  onDefault: (id: string) => void;
  onShow?: (row: ListRow) => void;
  onRemove: (row: ListRow) => void;
  onSave: (row: ListRow) => void;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const { showLdsContent } = useFaithTradition();
  const base = baseBibleLabel(showLdsContent);
  const muted = { fontFamily: fonts.sans, fontSize: 0.75 * REM, lineHeight: 0.75 * REM * 1.5, color: colors.foregroundMuted } as const;
  const row = (first: boolean) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: colors.surfaceBorder }) as const;
  return (
    <View style={{ gap: 12 }}>
      <View accessibilityLabel="Your Bibles" style={{ borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.card }}>
        <View style={row(true)} testID="bible-row-lds">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>{base}</Text>
            <Text style={[muted, { marginTop: 2 }]}>English · Available offline</Text>
          </View>
          <LinkButton
            label={defaultBible === LDS_BIBLE_ID ? "Default" : "Make default"}
            accessibilityLabel={`Use ${base} as default`}
            selected={defaultBible === LDS_BIBLE_ID}
            onPress={() => onDefault(LDS_BIBLE_ID)}
          />
        </View>
        {rows.map((item) => {
          const isDefault = sameBibleId(defaultBible, item.id);
          return (
            <View key={item.id} style={row(false)} testID={`bible-row-${item.id}`}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>{item.label}</Text>
                <Text style={[muted, { marginTop: 2 }]}>{[item.language, item.abbreviation, item.saved ? "" : "Not saved"].filter(Boolean).join(" · ")}</Text>
              </View>
              {item.saved ? (
                <LinkButton label={isDefault ? "Default" : "Make default"} accessibilityLabel={`Use ${item.label} as default`} selected={isDefault} onPress={() => onDefault(item.id)} />
              ) : null}
              {onShow && !isDefault ? <SettingSwitch value={item.shown} onChange={() => onShow(item)} label={`Show ${item.label}`} /> : null}
              {item.saved ? (
                <SmallIconButton icon="trash" label={`Remove ${item.label}`} onPress={() => onRemove(item)} />
              ) : (
                <LinkButton label="Save" accessibilityLabel={`Save ${item.label}`} onPress={() => onSave(item)} />
              )}
            </View>
          );
        })}
      </View>
      {rows.length ? null : <Text style={muted}>Add a Bible to read it verse by verse beside the base text.</Text>}
      <Pressable
        testID="add-bible"
        accessibilityRole="button"
        onPress={onAdd}
        style={({ pressed }) => ({
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          backgroundColor: pressed ? colors.surfaceButtonHover : colors.background,
        })}
      >
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>+ Add Bible</Text>
      </Pressable>
    </View>
  );
}

/** Full screen, as the web's editor is on phones: a title, Back where there's somewhere to go back to, and Done. */
function Editor({ view, onBack, onDone, children }: { view: EditorView | null; onBack: () => void; onDone: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={view !== null} animationType="slide" onRequestClose={view === "list" || view === null ? onDone : onBack} statusBarTranslucent navigationBarTranslucent>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder }}>
          <View style={{ width: 80, alignItems: "flex-start" }}>
            {view && view !== "list" ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 0.875 * REM, color: colors.foreground }}>‹ Back</Text>
              </Pressable>
            ) : null}
          </View>
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansMedium, fontSize: 1 * REM, color: colors.foreground }}>
            {view ? TITLES[view] : ""}
          </Text>
          <View style={{ width: 80, alignItems: "flex-end" }}>
            <Pressable
              accessibilityRole="button"
              onPress={onDone}
              style={({ pressed }) => ({ minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : "transparent" })}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>Done</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView key={view ?? "closed"} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: 40 * REM, alignSelf: "center" }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function JstChoice() {
  const { colors } = useTheme();
  const [enabled, setEnabled] = useJstPreference();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const small = { fontFamily: fonts.sans, fontSize: 11, lineHeight: 17, color: colors.foregroundMuted } as const;
  return (
    <View testID="jst-choice">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={10} color={colors.foregroundMuted} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.foregroundMuted }}>Joseph Smith Translation</Text>
      </Pressable>
      {open ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <Text style={[small, { flex: 1 }]}>
            When the LDS edition is the main text, show selected JST passages in place of the KJV verses they revise, with the JST’s own wording underlined.{" "}
            <Text accessibilityRole="link" onPress={() => void openExternal(JST_SOURCE_DOCS_URL)} style={{ textDecorationLine: "underline" }}>
              Source
            </Text>
          </Text>
          <SettingSwitch value={enabled} onChange={(next) => setFailed(!setEnabled(next))} label="Joseph Smith Translation (JST)" testID="jst-switch" />
        </View>
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" style={[small, { color: colors.accentRubric }]}>
          {SAVE_FAILED}
        </Text>
      ) : null}
    </View>
  );
}

export default function BibleTranslationControls({ shown = NO_COMPARISONS, onShownChange }: Props) {
  const { colors } = useTheme();
  const { showLdsContent } = useFaithTradition();
  const saved = useSavedBibles();
  const [defaultBible] = useDefaultBible();
  const [view, setView] = useState<EditorView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsavedIds = shown.filter((id) => !saved.some((item) => sameBibleId(item.id, id)));
  const needsCatalogNames = unsavedIds.some((id) => !KNOWN_BIBLES.some((item) => sameBibleId(item.id, id)));
  const { catalog } = useTranslationCatalog(needsCatalogNames);
  const rows: ListRow[] = [
    ...saved.map((item) => ({ ...item, saved: true, shown: shown.some((id) => sameBibleId(id, item.id)) })),
    ...unsavedIds.map((id) => {
      const known = KNOWN_BIBLES.find((item) => sameBibleId(item.id, id));
      const entry = catalog?.find((item) => sameBibleId(item.id, id));
      const described = known ?? (entry ? { id, label: translationTitle(entry), language: translationLanguage(entry), abbreviation: entry.shortName } : { id, label: id });
      return { ...described, id, saved: false, shown: true };
    }),
  ];

  const attempt = (ok: boolean) => setError(ok ? null : SAVE_FAILED);
  const listProps = {
    rows,
    defaultBible,
    onDefault: (id: string) => attempt(setDefaultBible(id)),
    onShow: onShownChange ? (row: ListRow) => onShownChange(row.id, !row.shown) : undefined,
    onRemove: (row: ListRow) => {
      const ok = removeBible(row.id);
      attempt(ok);
      if (ok && row.shown) onShownChange?.(row.id, false);
    },
    onSave: ({ id, label, language, abbreviation }: ListRow) => attempt(saveBible({ id, label, language, abbreviation })),
    onAdd: () => setView("catalog"),
  };

  const add = (bible: SavedBible) => {
    const ok = saveBible(bible);
    attempt(ok);
    if (!ok) return;
    onShownChange?.(bible.id, true);
    setView("list");
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.sansMedium, fontSize: 0.875 * REM, color: colors.foreground }}>
          Your Bibles
        </Text>
        <SmallIconButton icon="up-right-and-down-left-from-center" label="Open Your Bibles in a larger view" onPress={() => setView("list")} />
      </View>
      <Text style={{ fontFamily: fonts.sans, fontSize: 0.75 * REM, lineHeight: 0.75 * REM * 1.5, color: colors.foregroundMuted }}>
        Your default Bible is the main text when you open Bible chapters. Removing it restores the King James Bible.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.accentRubric }}>
          {error}
        </Text>
      ) : null}
      <BibleList {...listProps} />
      <Editor view={view} onDone={() => setView(null)} onBack={() => setView(view === "language" ? "catalog" : "list")}>
        {error ? (
          <Text accessibilityRole="alert" style={{ marginBottom: 12, fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.accentRubric }}>
            {error}
          </Text>
        ) : null}
        {view === "list" ? (
          <BibleList {...listProps} />
        ) : view ? (
          <TranslationCatalogPicker
            savedIds={saved.map((item) => item.id)}
            onAdd={add}
            choosingLanguage={view === "language"}
            onChoosingLanguageChange={(next) => setView(next ? "language" : "catalog")}
          />
        ) : null}
      </Editor>
      {showLdsContent ? <JstChoice /> : null}
    </View>
  );
}
