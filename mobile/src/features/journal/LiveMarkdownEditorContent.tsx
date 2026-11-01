import { useEffect, useRef, useState, type CSSProperties } from "react";
import MarkdownEditor from "../../../../src/features/notes/MarkdownEditor";
import "./LiveMarkdownEditor.css";

type EditorColors = {
  foreground: string;
  foregroundSoft: string;
  surfaceBorder: string;
  inputSurface: string;
  accentRubric: string;
  accentPrimary: string;
  surfaceButtonHover: string;
  ruleStrong: string;
};

export type LiveMarkdownEditorProps = {
  value: string;
  acknowledgedSequence: number;
  colors: EditorColors;
  autoFocus: boolean;
  onEdit: (value: string, sequence: number) => Promise<void>;
  onBlur: () => Promise<void>;
  dom?: import("expo/dom").DOMProps;
};

export default function LiveMarkdownEditorContent({
  value,
  acknowledgedSequence,
  colors,
  autoFocus,
  onEdit,
  onBlur,
}: LiveMarkdownEditorProps) {
  const [text, setText] = useState(value);
  const sequence = useRef(acknowledgedSequence);
  const pending = useRef(Promise.resolve());

  useEffect(() => {
    if (acknowledgedSequence >= sequence.current) setText(value);
  }, [value, acknowledgedSequence]);

  function change(next: string) {
    setText(next);
    const sent = ++sequence.current;
    pending.current = Promise.all([pending.current, onEdit(next, sent)]).then(() => undefined);
  }

  const variables = {
    "--ink": colors.foreground,
    "--foreground-soft": colors.foregroundSoft,
    "--accent-rubric": colors.accentRubric,
    "--accent-secondary": colors.accentRubric,
    "--accent-primary": colors.accentPrimary,
    "--surface-button-hover": colors.surfaceButtonHover,
    "--rule-strong": colors.ruleStrong,
    "--font-serif-text": 'Georgia, "Times New Roman", serif',
    "--font-mono": "ui-monospace, monospace",
  } as CSSProperties;

  return (
    <div
      style={{ ...variables, height: "100dvh", background: colors.inputSurface }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          pending.current = pending.current.then(() => onBlur());
        }
      }}
    >
      <MarkdownEditor
        value={text}
        onChange={change}
        ariaLabel="Note text (Markdown)"
        autoFocus={autoFocus}
        placeholder="Write a note…"
      />
    </div>
  );
}
