// The full annotation editor for one verse (VerseAnnotationEditor.tsx): its private note, highlight and underline
// together, saved only when Save is pressed (on this device, or signed in to the account through its outbox). The Annotate panel's "Write a note" / "Edit your
// note" opens it on the first selected verse. It starts from the verse's saved note and marks, so saving the
// note never drops a mark, and changing a mark here never drops the note.

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Sheet from "../../components/Sheet";
import { Button } from "../../components/ui";
import {
  ANNOTATION_BODY_MAX,
  MARK_COLORS,
  annotationProblem,
  highlightOf,
  isCustomMarkColor,
  markColorLabel,
  underlineColorOf,
  type MarkColor,
  type MarkKind,
  type VerseAnnotation,
} from "../../shared/web";
import { attempt } from "../../storage/study";
import { assertStudyIdentity, useStudyIdentity } from "../../storage/studySession";
import { useVerseConflict, verseStudy } from "../../storage/verseAnnotations";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import MarkSample from "./MarkSample";
import { CustomMarkColor } from "./MarkStylePicker";

type Choice = MarkColor | "none";

/** One mark's color (or none), each choice showing how the mark looks (MarkColorChoice). */
function MarkColorChoice({ kind, value, onChange }: { kind: MarkKind; value: Choice; onChange: (color: Choice) => void }) {
  const { colors } = useTheme();
  const title = kind === "highlight" ? "Highlight" : "Underline";
  const options: Choice[] = ["none", ...MARK_COLORS, ...(isCustomMarkColor(value) ? [value] : [])];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundMuted }}>{title}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        {options.map((option) => {
          const active = option === value;
          const label = option === "none" ? "None" : markColorLabel(option);
          return (
            <Pressable
              key={option}
              testID={`note-${kind}-${option}`}
              accessibilityRole="radio"
              accessibilityLabel={option === "none" ? `No ${kind}` : `${label} ${kind}`}
              accessibilityState={{ checked: active }}
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
        <CustomMarkColor value={value} kind={kind} label={title} disabled={false} onChange={onChange} />
      </View>
    </View>
  );
}

function Editor({ target, label, annotation: current, onClose }: Props) {
  const { colors } = useTheme();
  const identity = useStudyIdentity();
  const [openedIdentity] = useState(identity);
  // The verse as it was when the editor opened: a change made in the account meanwhile is merged or reported.
  const [annotation] = useState(current);
  const conflict = useVerseConflict(target);
  const [text, setText] = useState(annotation?.body ?? "");
  const [highlight, setHighlight] = useState<Choice>(highlightOf(annotation));
  const [underline, setUnderline] = useState<Choice>(underlineColorOf(annotation));
  const [error, setError] = useState<string | null>(null);
  const highlightColor = highlight === "none" ? undefined : highlight;
  const underlineColor = underline === "none" ? undefined : underline;
  const canSave = annotationProblem(text, highlightColor, underlineColor !== undefined, annotation?.text_marks) === null;

  const save = () => {
    if (!canSave) return;
    const problem = attempt(() => { assertStudyIdentity(openedIdentity); verseStudy.saveAnnotation(target, text, { highlightColor, underlineColor }, annotation); });
    if (problem) setError("Couldn't save this annotation. Try again.");
    else onClose();
  };
  const remove = () => {
    if (!annotation) return onClose();
    const problem = attempt(() => { assertStudyIdentity(openedIdentity); verseStudy.remove(target, annotation); });
    if (problem) setError("Couldn't delete this annotation. Try again.");
    else onClose();
  };

  if (identity !== openedIdentity) return <View style={{ gap: 12 }}>
    <Text>Your account changed. Reopen this annotation to edit the current study.</Text>
    <Button label="Close annotation" onPress={onClose} />
  </View>;

  return (
    <>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentRubric }}>{label}</Text>
      {conflict ? (
        <View accessibilityRole="alert" testID="verse-note-conflict" style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.foreground }}>
            {conflict.conflict?.kind === "verse" && conflict.conflict.server
              ? `This verse's note or marks were also changed on the website or another device${conflict.conflict.server.body ? `: “${conflict.conflict.server.body}”` : ""}. Nothing was overwritten.`
              : "This verse's note was deleted on the website or another device. Nothing was overwritten."}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button variant="secondary" label="Keep my version" onPress={() => verseStudy.resolve(conflict.opId, "keepMine")} testID="verse-conflict-keep" />
            <Button variant="secondary" label="Use the other version" onPress={() => verseStudy.resolve(conflict.opId, "useTheirs")} testID="verse-conflict-theirs" />
          </View>
        </View>
      ) : null}
      <TextInput
        testID="verse-note-text"
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={ANNOTATION_BODY_MAX}
        placeholder="Write a note tied to this verse..."
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
        {text.length}/{ANNOTATION_BODY_MAX}
      </Text>
      <MarkColorChoice kind="highlight" value={highlight} onChange={setHighlight} />
      <MarkColorChoice kind="underline" value={underline} onChange={setUnderline} />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.accentRubric }}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        {annotation ? <Button variant="danger" label="Delete" onPress={remove} testID="verse-note-delete" /> : null}
        <Button label="Add annotation" onPress={save} disabled={!canSave} testID="verse-note-save" />
      </View>
    </>
  );
}

type Props = {
  target: { volume: string; book: string; chapter: number; verse: number };
  /** Shown above the note, e.g. "Alma 32:21". */
  label: string;
  annotation: VerseAnnotation | null;
  onClose: () => void;
};

export default function VerseNoteSheet({ visible, ...props }: Props & { visible: boolean }) {
  return (
    <Sheet visible={visible} onClose={props.onClose} title="Add annotation" testID="verse-note-sheet">
      {/* Mounted per opening and verse, so it always starts from what is saved now. */}
      {visible ? <Editor key={`${props.target.chapter}:${props.target.verse}`} {...props} /> : null}
    </Sheet>
  );
}
