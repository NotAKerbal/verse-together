"use client";

import { useId } from "react";
import MarkSample from "./MarkSample";
import CustomMarkColor from "./CustomMarkColor";
import { isCustomMarkColor } from "./markColors";
import { MARK_COLOR_OPTIONS, markColorLabel, type AnnotationMarkColor, type MarkKind } from "./verseAnnotations";

const NONE_SWATCH = "h-3 w-3 rounded-full border border-[color:var(--surface-border)]";

/** One mark's color (or none), as a row of pressable choices, each showing how the mark looks. */
export default function MarkColorChoice({
  kind,
  value,
  disabled,
  onChange,
}: {
  kind: MarkKind;
  value: AnnotationMarkColor;
  disabled: boolean;
  onChange: (color: AnnotationMarkColor) => void;
}) {
  const title = kind === "highlight" ? "Highlight" : "Underline";
  const labelId = useId();
  const options: Array<{ value: AnnotationMarkColor; label: string }> = [{ value: "none", label: "None" }, ...MARK_COLOR_OPTIONS];
  if (isCustomMarkColor(value)) options.push({ value, label: markColorLabel(value) });
  return (
    <div className="space-y-1">
      <div id={labelId} className="text-sm text-foreground/70">
        {title}
      </div>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-label={option.value === "none" ? `No ${kind}` : `${option.label} ${kind}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs disabled:opacity-60 ${
                active ? "border-foreground bg-foreground/[0.06] ring-1 ring-foreground" : "surface-button"
              }`}
              aria-pressed={active}
            >
              {option.value === "none" ? (
                <span className={NONE_SWATCH} aria-hidden="true" />
              ) : (
                <MarkSample preset={{ kind, color: option.value }} />
              )}
              {option.label}
            </button>
          );
        })}
        <CustomMarkColor value={value} onChange={onChange} label={title} disabled={disabled} />
      </div>
    </div>
  );
}
