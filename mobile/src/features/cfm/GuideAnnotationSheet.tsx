// The full annotation editor for a span of a study guide (the website's GuideAnnotationEditor over its shared
// AnnotationEditorForm): the selected passage, its note, highlight and underline, saved together with Save. It starts
// from the span as saved; a saved copy that changes later (another device, a late read) refreshes an untouched form
// but never an edited one. Leaving with unsaved changes asks first, and Delete asks before removing a saved span.

import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import Sheet from "../../components/Sheet";
import { Button } from "../../components/ui";
import { ANNOTATION_BODY_MAX, MARK_COLORS, annotationProblem, isCustomMarkColor, markColorLabel, type MarkColor, type MarkKind } from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import type { GuideHighlight } from "@/features/comeFollowMe/guideAnchors";
import type { GuideAnnotationPatch } from "../../../../convex/annotationRules";
import MarkSample from "../reader/MarkSample";
import { CustomMarkColor } from "../reader/MarkStylePicker";

const QUOTE_SHOWN = 280;

type Draft = Required<GuideAnnotationPatch>;
type Choice = MarkColor | "none";

function MarkColorChoice({ kind, value, disabled, onChange }: { kind: MarkKind; value: Choice; disabled: boolean; onChange: (color: Choice) => void }) {
  const { colors } = useTheme();
  const title = kind === "highlight" ? "Highlight" : "Underline";
  const options: Choice[] = ["none", ...MARK_COLORS, ...(isCustomMarkColor(value) ? [value] : [])];
  return (
    <View style={{ gap: 6, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundMuted }}>{title}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        {options.map((option) => {
          const active = option === value;
          const label = option === "none" ? "None" : markColorLabel(option);
          return (
            <Pressable
              key={option}
              testID={`guide-note-${kind}-${option}`}
              accessibilityRole="radio"
              accessibilityLabel={option === "none" ? `No ${kind}` : `${label} ${kind}`}
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              onPress={() => onChange(option)}
              style={{
                minHeight: 36,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.foreground : colors.surfaceBorder,
                backgroundColor: active ? colors.surfaceCardSoft : colors.surfaceButton,
              }}
            >
              {option === "none" ? <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.surfaceBorder }} /> : <MarkSample preset={{ kind, color: option }} size={12} />}
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foreground }}>{label}</Text>
            </Pressable>
          );
        })}
        <CustomMarkColor value={value} kind={kind} label={title} disabled={disabled} onChange={onChange} />
      </View>
    </View>
  );
}

type Props = {
  /** The selected passage's text. */
  quote: string;
  /** The saved span on exactly this passage, or null for a new one. */
  current: GuideHighlight | null;
  /** Saves the note, highlight and underline as shown (null: none); rejects when it couldn't. */
  onSave: (patch: Draft) => Promise<unknown>;
  /** Removes the saved span; null when there is none. */
  onDelete: (() => Promise<unknown>) | null;
  onClose: () => void;
};

const draftOf = (current: GuideHighlight | null): Draft => ({
  body: current?.body ?? "",
  highlightColor: current?.highlightColor ?? null,
  underlineColor: current?.underlineColor ?? null,
});
const versionOf = (current: GuideHighlight | null) => (current ? `${current.id}:${current.updatedAt}` : "none");

/** The editor's state and its rules, apart from how it looks. */
export function useGuideAnnotationDraft({ current, onSave, onDelete, onClose }: Omit<Props, "quote">) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(current));
  const [seededFrom, setSeededFrom] = useState(() => versionOf(current));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A newer saved copy updates an untouched form, never an edited draft.
  const version = versionOf(current);
  if (!dirty && seededFrom !== version) {
    setSeededFrom(version);
    setDraft(draftOf(current));
  }

  const canSave = !busy && annotationProblem(draft.body, draft.highlightColor ?? undefined, draft.underlineColor !== null) === null;

  const edit = (patch: Partial<Draft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  };

  async function run(action: () => Promise<unknown>, failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setBusy(false);
      onClose();
    } catch {
      setError(failure);
      setBusy(false);
    }
  }

  const save = () => {
    if (canSave) void run(() => onSave(draft), "Couldn't save this annotation. Try again.");
  };
  const remove = () => {
    if (!onDelete || busy) return;
    Alert.alert("Delete this annotation?", "Its note and marks will be removed. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run(onDelete, "Couldn't delete this annotation. Try again.") },
    ]);
  };
  /** Closing (the close button, the backdrop, Android's back): unsaved changes are kept unless the reader discards them. */
  const requestClose = () => {
    if (busy) return;
    if (!dirty) return onClose();
    Alert.alert("Discard changes?", "Your note and marks for this passage haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  };

  return { draft, edit, dirty, busy, error, canSave, save, remove, requestClose };
}

function Editor({ quote, current, onDelete, state }: Pick<Props, "quote" | "current" | "onDelete"> & { state: ReturnType<typeof useGuideAnnotationDraft> }) {
  const { colors } = useTheme();
  const { draft, edit, busy, error, canSave, save, remove } = state;
  const shown = quote.length > QUOTE_SHOWN ? `${quote.slice(0, QUOTE_SHOWN).trimEnd()}…` : quote;
  return (
    <>
      <Text testID="guide-note-quote" style={{ borderLeftWidth: 2, borderLeftColor: colors.surfaceBorder, paddingLeft: 12, fontFamily: fonts.serif, fontSize: 15, lineHeight: 22, color: colors.foregroundMuted }}>
        {shown}
      </Text>
      <TextInput
        testID="guide-note-text"
        accessibilityLabel="Note"
        value={draft.body}
        onChangeText={(body) => edit({ body })}
        editable={!busy}
        multiline
        maxLength={ANNOTATION_BODY_MAX}
        placeholder="Write a note tied to this passage..."
        placeholderTextColor={colors.foregroundSoft}
        style={{
          minHeight: 110,
          textAlignVertical: "top",
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          backgroundColor: colors.inputSurface,
          color: colors.foreground,
          fontFamily: fonts.sans,
          fontSize: 16,
        }}
      />
      <Text style={{ alignSelf: "flex-end", marginTop: -10, fontFamily: fonts.sans, fontSize: 11, color: colors.foregroundSoft }}>
        {draft.body.length}/{ANNOTATION_BODY_MAX}
      </Text>
      <MarkColorChoice kind="highlight" value={draft.highlightColor ?? "none"} disabled={busy} onChange={(color) => edit({ highlightColor: color === "none" ? null : color })} />
      <MarkColorChoice kind="underline" value={draft.underlineColor ?? "none"} disabled={busy} onChange={(color) => edit({ underlineColor: color === "none" ? null : color })} />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.accentRubric }}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        {current && onDelete ? <Button variant="danger" label="Delete" onPress={remove} disabled={busy} testID="guide-note-delete" /> : null}
        <Button label={busy ? "Saving..." : current ? "Save annotation" : "Add annotation"} onPress={save} disabled={!canSave} testID="guide-note-save" />
      </View>
    </>
  );
}

function OpenSheet(props: Props) {
  const state = useGuideAnnotationDraft(props);
  return (
    <Sheet visible onClose={state.requestClose} title={`${props.current ? "Edit annotation" : "Annotate"} - Study guide`} testID="guide-note-sheet">
      <Editor quote={props.quote} current={props.current} onDelete={props.onDelete} state={state} />
    </Sheet>
  );
}

export default function GuideAnnotationSheet({ visible, ...props }: Props & { visible: boolean }) {
  // Mounted per opening, so it always starts from what is saved now.
  return visible ? <OpenSheet {...props} /> : null;
}
