"use client";

// An entry's reading, as one chip: "Read 1 Nephi 2" when the entry logs reading, a dashed "Log reading" when it
// doesn't. Choosing it opens a small editor for the passage or guide, the whole chapter or some verses, and the day,
// with a way to remove the reading. The entry stays one entry throughout; chapter completion is never touched.

import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faChevronDown, faPlus } from "@fortawesome/free-solid-svg-icons";
import { scriptureCatalog } from "../../lib/scriptureCatalog";
import type { NoteSource } from "./journal";

export type ReadingOption = {
  source: NoteSource;
  /** Verses in the chapter, when known; otherwise the catalog's count is used. */
  verseCount?: number;
};
/** What can be logged from a page (its chapter or guide). */
export type ReadingLogOption = ReadingOption;
export type ReadingDetails = { source: NoteSource; journalDate: string };

const JOURNAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Below lg these sit in the phone sheet: touch-sized controls and 16px inputs, so iOS doesn't zoom.
const INPUT_CLASS =
  "block h-11 w-full min-w-0 rounded-lg border-2 border-[color:var(--surface-border)] bg-transparent px-2 text-base lg:h-9 lg:text-sm";
const BUTTON_CLASS =
  "inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50 lg:h-9 lg:px-3 lg:text-xs";

/** The whole chapter a scripture source points into. */
function chapterSource(source: NoteSource): NoteSource {
  if (source.kind !== "scripture" || source.verseStart === undefined) return source;
  const chapter = { ...source };
  delete chapter.verseStart;
  delete chapter.verseEnd;
  return { ...chapter, label: source.label.replace(/:\d+(?:[-–]\d+)?$/, ""), href: source.href.split("#")[0] };
}

function chapterKey(source: NoteSource) {
  const chapter = chapterSource(source);
  return `${chapter.kind}|${chapter.href}`;
}

export default function ReadingChip({
  value,
  options,
  defaultDate,
  disabled = false,
  canRemove = true,
  onChange,
}: {
  value: ReadingDetails | null;
  options: ReadingOption[];
  defaultDate: string;
  disabled?: boolean;
  /** False keeps the reading (an entry without note text): explained under the editor's actions. */
  canRemove?: boolean;
  onChange: (reading: ReadingDetails | null) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<NoteSource | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [part, setPart] = useState(false);
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    function outside(event: PointerEvent) {
      if (!busy.current && !root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // One choice per chapter or guide, the entry's own first.
  const choices: ReadingOption[] = [];
  for (const option of value ? [{ source: value.source }, ...options] : options) {
    if (!choices.some((other) => chapterKey(other.source) === chapterKey(option.source))) choices.push(option);
  }
  const whole = source ? chapterSource(source) : null;
  const scripture = !!whole && whole.kind === "scripture" && whole.chapter !== undefined;
  const verseCount =
    options.find((option) => whole && chapterKey(option.source) === chapterKey(whole))?.verseCount ??
    (whole?.volume && whole.book && whole.chapter
      ? scriptureCatalog.getBook(whole.volume, whole.book)?.verseCounts[whole.chapter - 1]
      : undefined);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const next = value?.source ?? choices[0]?.source;
    if (!next) return;
    setSource(next);
    setDate(value?.journalDate ?? defaultDate);
    setPart(next.verseStart !== undefined);
    setStart(String(next.verseStart ?? 1));
    setEnd(String(next.verseEnd ?? next.verseStart ?? 1));
    setError(null);
    setOpen(true);
  }

  async function save(remove = false) {
    if (busy.current || !whole) return;
    let next = whole;
    if (!remove && part && scripture) {
      const first = Number(start);
      const last = Number(end);
      if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || (verseCount && last > verseCount)) {
        setError(verseCount ? `Choose verses between 1 and ${verseCount}, in order.` : "Choose a valid verse range, in order.");
        return;
      }
      next = {
        ...whole,
        label: `${whole.label}:${first}${last === first ? "" : `-${last}`}`.slice(0, 200),
        href: `${whole.href}#v-${first}`,
        verseStart: first,
        verseEnd: last,
      };
    }
    if (!remove && !JOURNAL_DATE.test(date)) {
      setError("Choose the day you read it.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onChange(remove ? null : { source: next, journalDate: date });
      close();
    } catch {
      setError("Your reading wasn't saved. Check the details and try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!value && choices.length === 0) return null;
  return (
    <div ref={root} className="relative w-fit max-w-full">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Edit reading: ${value.source.label}` : "Log reading"}
        className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50 lg:min-h-9 lg:text-xs ${
          value
            ? "border-[color:var(--accent-secondary)] bg-[color:var(--accent-note)] text-foreground hover:bg-[color:var(--surface-button-hover)]"
            : "border-dashed border-[color:var(--surface-border)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-button-hover)]"
        }`}
      >
        <FontAwesomeIcon icon={value ? faBookOpen : faPlus} className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{value ? `Read ${value.source.label}` : "Log reading"}</span>
        {value ? <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> : null}
      </button>
      {open && whole ? (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={`${id}-title`}
          tabIndex={-1}
          className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-2xl border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-4 text-sm text-foreground shadow-[var(--surface-shadow-lift)] outline-none"
          onKeyDown={(event) => {
            // Handled here, so a surrounding sheet or dialog doesn't close on the same key.
            if (event.key === "Escape" && !busy.current) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "radio") {
              event.preventDefault();
              event.stopPropagation();
              void save();
            }
          }}
        >
          <h3 id={`${id}-title`} className="font-bold">
            {value ? "Edit reading" : "Log reading"}
          </h3>
          {choices.length > 1 ? (
            <fieldset disabled={saving} className="space-y-1">
              <legend className="mb-1 text-xs font-semibold text-[color:var(--foreground-muted)]">Passage or guide</legend>
              {choices.map((option) => {
                const choice = chapterSource(option.source);
                return (
                  <label key={chapterKey(option.source)} className="flex min-h-11 items-center gap-3 lg:min-h-0 lg:gap-2 lg:py-1">
                    <input
                      type="radio"
                      name={`${id}-source`}
                      checked={chapterKey(choice) === chapterKey(whole)}
                      onChange={() => {
                        setSource(option.source);
                        setPart(false);
                      }}
                      className="h-5 w-5 shrink-0 lg:h-auto lg:w-auto"
                    />
                    <span className="min-w-0 wrap-anywhere">{choice.label}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <p className="font-semibold wrap-anywhere">{whole.label}</p>
          )}
          {scripture ? (
            <div className="space-y-3">
              <div role="group" aria-label="Reading range" className="segmented-control flex">
                <button
                  type="button"
                  aria-pressed={!part}
                  disabled={saving}
                  onClick={() => setPart(false)}
                  className="segmented-control-button min-h-11 flex-1 lg:min-h-0"
                  data-active={!part}
                >
                  Whole chapter
                </button>
                <button
                  type="button"
                  aria-pressed={part}
                  disabled={saving}
                  onClick={() => setPart(true)}
                  className="segmented-control-button min-h-11 flex-1 lg:min-h-0"
                  data-active={part}
                >
                  Verses
                </button>
              </div>
              {part ? (
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold">
                    First verse
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={verseCount}
                      value={start}
                      disabled={saving}
                      onChange={(event) => setStart(event.target.value)}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold">
                    Last verse
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={verseCount}
                      value={end}
                      disabled={saving}
                      onChange={(event) => setEnd(event.target.value)}
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
          <label className="block space-y-1 text-xs font-semibold">
            Read on
            <input
              type="date"
              value={date}
              disabled={saving}
              onChange={(event) => setDate(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs font-semibold text-[color:var(--accent-rubric)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {value ? (
              <button
                type="button"
                disabled={saving || !canRemove}
                onClick={() => void save(true)}
                className={`${BUTTON_CLASS} -ml-3 mr-auto text-[color:var(--accent-rubric)] lg:-ml-2`}
              >
                Remove reading
              </button>
            ) : (
              <span className="mr-auto" />
            )}
            <button type="button" onClick={close} disabled={saving} className={`${BUTTON_CLASS} surface-button border-2`}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className={`${BUTTON_CLASS} bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)]`}
            >
              {saving ? "Saving…" : value ? "Save reading" : "Log reading"}
            </button>
          </div>
          {value && !canRemove ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">
              Add a note before removing the reading, or delete the entry.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
