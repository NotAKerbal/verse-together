"use client";

import { useId, useState } from "react";
import { isMarkColor, type MarkColor } from "../../../convex/annotationRules";
import { isCustomMarkColor } from "./markColors";

export default function CustomMarkColor({ value, onChange, label, disabled, unavailable, keepSelection = false }: {
  value: MarkColor | "none";
  onChange: (color: MarkColor) => void;
  label: string;
  disabled?: boolean;
  unavailable?: (color: MarkColor) => string | null;
  keepSelection?: boolean;
}) {
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="mark-custom">
      <label className="mark-custom-control">
        <input
          type="color"
          value={isCustomMarkColor(value) ? value : "#e2574c"}
          aria-label={`${label} custom color`}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onMouseDown={keepSelection ? event => { if (event.button === 0) event.preventDefault(); } : undefined}
          onChange={event => {
            const color = event.target.value.toLowerCase();
            if (!isMarkColor(color)) return;
            const problem = unavailable?.(color) ?? null;
            setError(problem);
            if (!problem) onChange(color);
          }}
        />
        <span>Custom</span>
      </label>
      {error ? <span id={errorId} role="status" className="text-xs text-foreground/70">{error}</span> : null}
    </span>
  );
}
