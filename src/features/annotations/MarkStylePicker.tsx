"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { MARK_COLORS, MARK_KINDS, type MarkColor, type MarkKind } from "../../../convex/annotationRules";
import MarkSample from "./MarkSample";
import { markColorLabel } from "./verseAnnotations";
import CustomMarkColor from "./CustomMarkColor";
import { customMarkStyle, isCustomMarkColor } from "./markColors";

export type MarkStyle = { kind: MarkKind; color: MarkColor };

const KIND_LABELS: Record<MarkKind, string> = { highlight: "Highlight", underline: "Underline" };

type Props = {
  value: MarkStyle;
  onChange: (next: MarkStyle) => void;
  /** Names the picker's two groups: "<label> style" and "<label> color". */
  label: string;
  /**
   * Why a style can't be chosen (it is already another quick mark, say), or null if it can. Such a color
   * stays visible, with the reason in its name and tooltip, but can't be picked (the arrow keys skip
   * it); nor can a kind with no color left. Picking a kind keeps the color when that pair is free.
   */
  unavailable?: (style: MarkStyle) => string | null;
  /** The whole picker waits (still loading): nothing can be picked. */
  disabled?: boolean;
  /** Keep the reader's text selection when a choice is clicked (the selection menu). */
  keepSelection?: boolean;
  className?: string;
};

function preserveSelection(event: MouseEvent<HTMLElement>) {
  if (event.button === 0) event.preventDefault();
}

/**
 * Arrow keys (and Home and End) move the choice within a radio group, skipping choices that can't be picked,
 * as a native radio group does; Tab leaves the group from its checked choice.
 */
function onRadioKeyDown(event: KeyboardEvent<HTMLElement>) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!step && event.key !== "Home" && event.key !== "End") return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']:not([aria-disabled='true'])"));
  if (radios.length === 0) return;
  const index = radios.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home" ? radios[0]
    : event.key === "End" ? radios[radios.length - 1]
    : radios[(index + step + radios.length) % radios.length];
  event.preventDefault();
  event.stopPropagation();
  next.focus();
  next.click();
}

/**
 * A visual choice of a mark's style: highlight or underline (each shown as it marks a letter), and one of the
 * preset or custom colors (swatches drawn as the chosen kind: a chip for a highlight, a rule for an underline). Two
 * radio groups, so a screen reader hears "Underline, radio button, checked, 2 of 2".
 */
export default function MarkStylePicker({ value, onChange, label, unavailable, disabled = false, keepSelection = false, className }: Props) {
  const reason = (style: MarkStyle) => unavailable?.(style) ?? null;
  const firstColor = (kind: MarkKind) => MARK_COLORS.find((color) => !reason({ kind, color })) ?? null;
  const onMouseDown = keepSelection ? preserveSelection : undefined;
  const colors: readonly MarkColor[] = isCustomMarkColor(value.color) ? [...MARK_COLORS, value.color] : MARK_COLORS;

  function pickKind(kind: MarkKind) {
    if (disabled || kind === value.kind) return;
    // Keep the color when that pair is free; otherwise the kind's first free color.
    const color = reason({ kind, color: value.color }) ? firstColor(kind) : value.color;
    if (color) onChange({ kind, color });
  }

  function pickColor(color: MarkColor) {
    if (disabled || color === value.color) return;
    if (reason({ kind: value.kind, color })) return;
    onChange({ kind: value.kind, color });
  }

  return (
    <div className={className ? `mark-picker ${className}` : "mark-picker"} data-kind={value.kind} aria-disabled={disabled || undefined}>
      <div className="mark-picker-kinds" role="radiogroup" aria-label={`${label} style`} aria-disabled={disabled || undefined} onKeyDown={onRadioKeyDown}>
        {MARK_KINDS.map((kind) => {
          const checked = kind === value.kind;
          const blocked = !checked && !!reason({ kind, color: value.color }) && !firstColor(kind);
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              className="mark-picker-kind"
              aria-checked={checked}
              aria-disabled={disabled || blocked || undefined}
              tabIndex={checked ? 0 : -1}
              title={blocked ? `Every ${kind} color is already a quick mark` : undefined}
              onMouseDown={onMouseDown}
              onClick={() => pickKind(kind)}
            >
              <MarkSample preset={{ kind, color: value.color }} />
              <span>{KIND_LABELS[kind]}</span>
            </button>
          );
        })}
      </div>
      <div className="mark-picker-colors" role="radiogroup" aria-label={`${label} color`} aria-disabled={disabled || undefined} onKeyDown={onRadioKeyDown}>
        {colors.map((color) => {
          const checked = color === value.color;
          const why = checked ? null : reason({ kind: value.kind, color });
          return (
            <button
              key={color}
              type="button"
              role="radio"
              className="mark-picker-color"
              data-color={color}
              style={customMarkStyle(color)}
              aria-label={why ? `${markColorLabel(color)}, ${why}` : markColorLabel(color)}
              aria-checked={checked}
              aria-disabled={disabled || !!why || undefined}
              tabIndex={checked ? 0 : -1}
              title={why ? `${markColorLabel(color)}: ${why}` : markColorLabel(color)}
              onMouseDown={onMouseDown}
              onClick={() => pickColor(color)}
            >
              <span className="mark-picker-swatch" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <CustomMarkColor value={value.color} onChange={pickColor} label={label} disabled={disabled} keepSelection={keepSelection} unavailable={color => reason({ kind: value.kind, color })} />
    </div>
  );
}
