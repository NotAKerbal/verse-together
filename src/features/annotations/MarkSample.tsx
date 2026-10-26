import type { MarkPreset } from "./verseAnnotations";

/**
 * A letter marked the way a preset marks a verse (.mark-sample in globals.css): on a tinted chip for a
 * highlight, over a colored rule for an underline. Decorative: whatever shows it names the mark in words.
 */
export default function MarkSample({ preset, className }: { preset: MarkPreset; className?: string }) {
  return (
    <span className={className ? `mark-sample ${className}` : "mark-sample"} data-kind={preset.kind} data-color={preset.color} aria-hidden="true">
      A
    </span>
  );
}
