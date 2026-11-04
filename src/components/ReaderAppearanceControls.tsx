"use client";

import type { CSSProperties } from "react";
import { useId } from "react";
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  type ReaderAppearance,
  type ReaderPreferences,
  type ReaderTextWidth,
} from "@/lib/preferences";

type Props = {
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
  showDescriptions?: boolean;
  showComparisonView?: boolean;
};

type Option<T extends string> = { value: T; label: string; className?: string };

const TYPEFACE_OPTIONS: ReadonlyArray<Option<ReaderPreferences["fontFamily"]>> = [
  { value: "serif", label: "Serif", className: "font-serif" },
  { value: "sans", label: "Sans", className: "font-sans" },
];

const TEXT_WIDTH_OPTIONS: ReadonlyArray<Option<ReaderTextWidth>> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];

const COMPARISON_OPTIONS: ReadonlyArray<Option<ReaderPreferences["comparisonView"]>> = [
  { value: "inline", label: "Inline" },
  { value: "sideBySide", label: "Side by side" },
];

const TEXT_WIDTH_DESCRIPTIONS: Record<ReaderTextWidth, string> = {
  comfortable: "A centered column for steady reading.",
  wide: "A wider column on large screens.",
  full: "Verses run the full width of the window.",
};

const COMPARISON_DESCRIPTIONS: Record<ReaderPreferences["comparisonView"], string> = {
  inline: "Compared translations follow each verse that differs.",
  sideBySide: "Compared translations sit beside each verse that differs.",
};

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const DRAG_GUARD = {
  onTouchStart: stopPropagation,
  onTouchMove: stopPropagation,
  onTouchEnd: stopPropagation,
};

function Segmented<T extends string>({
  legend,
  description,
  options,
  value,
  onSelect,
  className = "",
}: {
  legend: string;
  description?: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onSelect: (value: T) => void;
  className?: string;
}) {
  const descriptionId = useId();
  return (
    <fieldset className={`space-y-2 ${className}`} aria-describedby={description ? descriptionId : undefined}>
      <legend className="text-xs font-medium tracking-wide text-foreground/80">{legend}</legend>
      <div className="flex w-full overflow-hidden rounded-md border border-[color:var(--surface-border)]" {...DRAG_GUARD}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
              className={`min-h-11 flex-1 px-3 py-1.5 text-sm focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)] ${
                index > 0 ? "border-l border-[color:var(--surface-border)]" : ""
              } ${
                selected
                  ? "bg-foreground text-background"
                  : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
              } ${option.className ?? ""}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {description ? (
        <p id={descriptionId} className="text-[11px] text-foreground/60">
          {description}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ComparisonViewControl({
  prefs,
  onChange,
  showDescription = false,
}: {
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
  showDescription?: boolean;
}) {
  return (
    <Segmented
      legend="Comparison view"
      description={showDescription ? COMPARISON_DESCRIPTIONS[prefs.comparisonView] : undefined}
      options={COMPARISON_OPTIONS}
      value={prefs.comparisonView}
      onSelect={(value) => {
        if (prefs.comparisonView !== value) onChange({ ...prefs, comparisonView: value });
      }}
    />
  );
}

export default function ReaderAppearanceControls({
  prefs,
  onChange,
  showDescriptions = false,
  showComparisonView = true,
}: Props) {
  const sizeId = useId();
  const percent = Math.round(prefs.fontScale * 100);
  const fill = Math.max(0, Math.min(1, (prefs.fontScale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)));

  function set<K extends keyof ReaderAppearance>(key: K, value: ReaderAppearance[K]) {
    if (prefs[key] === value) return;
    onChange({ ...prefs, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-xs font-medium tracking-wide text-foreground/80">
          <label htmlFor={sizeId}>Text size</label>
          <span aria-hidden="true" className="tabular-nums text-foreground/60">{percent}%</span>
        </div>
        <div
          className="text-size-slider relative h-11 select-none rounded-md bg-black/10 dark:bg-white/15"
          style={{ "--text-size-fill": fill } as CSSProperties}
          {...DRAG_GUARD}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
        >
          <div className="text-size-slider-fill absolute inset-y-0 left-0 rounded-md bg-foreground" aria-hidden="true" />
          <div className="text-size-slider-bar" aria-hidden="true" />
          <input
            id={sizeId}
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.01}
            value={prefs.fontScale}
            aria-valuetext={`${percent}%`}
            onChange={(event) => set("fontScale", Number(event.target.value))}
            className="text-size-slider-input"
          />
        </div>
      </div>

      <Segmented
        legend="Typeface"
        description={showDescriptions ? "The typeface for scripture text. Controls and labels stay the same." : undefined}
        options={TYPEFACE_OPTIONS}
        value={prefs.fontFamily}
        onSelect={(value) => set("fontFamily", value)}
      />

      <Segmented
        legend="Text width"
        description={showDescriptions ? TEXT_WIDTH_DESCRIPTIONS[prefs.textWidth] : undefined}
        options={TEXT_WIDTH_OPTIONS}
        value={prefs.textWidth}
        onSelect={(value) => set("textWidth", value)}
        className="hidden md:block"
      />

      {showComparisonView ? (
        <ComparisonViewControl prefs={prefs} onChange={onChange} showDescription={showDescriptions} />
      ) : null}
    </div>
  );
}
