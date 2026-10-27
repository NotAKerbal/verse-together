"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isMarkColor, type MarkColor } from "../../../convex/annotationRules";
import { MARK_SWATCH_HEX, isCustomMarkColor, markColorHex } from "./markColors";

/**
 * Any color, from the browser's color picker. It opens on the color already chosen (a palette color as its
 * swatch), shows the color live while it is being picked, and chooses it once, when the picker is closed on
 * it (the input's change event), so dragging through colors never saves each one along the way.
 */
export default function CustomMarkColor({ value, onChange, label, disabled, unavailable, keepSelection = false }: {
  value: MarkColor | "none";
  onChange: (color: MarkColor) => void;
  label: string;
  disabled?: boolean;
  unavailable?: (color: MarkColor) => string | null;
  keepSelection?: boolean;
}) {
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The color being picked, shown until the picker closes on it.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === "none" ? MARK_SWATCH_HEX.red : markColorHex(value));

  const commitRef = useRef<(raw: string) => void>(() => {});
  useEffect(() => {
    commitRef.current = (raw: string) => {
      setDraft(null);
      const color = raw.toLowerCase();
      if (!isMarkColor(color) || color === value) return;
      const problem = unavailable?.(color) ?? null;
      setError(problem);
      if (!problem) onChange(color);
    };
  });

  // React's onChange on a color input follows every move in the picker; the native change event is the pick.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onCommit = () => commitRef.current(input.value);
    input.addEventListener("change", onCommit);
    return () => input.removeEventListener("change", onCommit);
  }, []);

  return (
    <span className="mark-custom" data-custom={isCustomMarkColor(value) || undefined}>
      <label className="mark-custom-control" title={`${label}: pick any color`}>
        <input
          ref={inputRef}
          type="color"
          value={shown}
          aria-label={`${label} custom color`}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onMouseDown={keepSelection ? event => { if (event.button === 0) event.preventDefault(); } : undefined}
          onChange={event => setDraft(event.target.value.toLowerCase())}
        />
        <span className="mark-custom-swatch" style={{ backgroundColor: shown }} aria-hidden="true" />
        <span>Custom</span>
      </label>
      {error ? <span id={errorId} role="status" className="mark-custom-error">{error}</span> : null}
    </span>
  );
}
