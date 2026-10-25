"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faChevronDown, faPlus } from "@fortawesome/free-solid-svg-icons";
import { scriptureCatalog } from "../../lib/scriptureCatalog";
import type { NoteSource } from "./journal";

export type ReadingOption = { source: NoteSource; verseCount?: number };
export type ReadingDetails = { source: NoteSource; journalDate: string };

function chapterSource(source: NoteSource): NoteSource {
  if (source.kind !== "scripture") return source;
  const chapter = { ...source };
  delete chapter.verseStart;
  delete chapter.verseEnd;
  return { ...chapter, label: source.label.replace(/:\d+(?:[-–]\d+)?$/, ""), href: source.href.split("#")[0] };
}

export default function ReadingChip({ value, options, defaultDate, disabled = false, canRemove = true, align = "start", onChange }: {
  value: ReadingDetails | null;
  options: ReadingOption[];
  defaultDate: string;
  disabled?: boolean;
  canRemove?: boolean;
  align?: "start" | "end";
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

  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    function outside(event: PointerEvent) {
      if (!busy.current && !root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function edit() {
    const next = value?.source ?? options[0]?.source;
    if (!next) return;
    setSource(next); setDate(value?.journalDate ?? defaultDate);
    setPart(next.verseStart !== undefined);
    setStart(String(next.verseStart ?? 1)); setEnd(String(next.verseEnd ?? next.verseStart ?? 1));
    setError(null); setOpen(!open);
  }

  const readingOptions = options.filter((option, index) => options.findIndex(other =>
    other.source.kind === option.source.kind && chapterSource(other.source).href === chapterSource(option.source).href
  ) === index);
  const whole = source ? chapterSource(source) : null;
  const option = options.find(option => whole && chapterSource(option.source).href === whole.href);
  const verseCount = option?.verseCount ?? (source?.volume && source.book && source.chapter
    ? scriptureCatalog.getBook(source.volume, source.book)?.verseCounts[source.chapter - 1] : undefined);
  const scripture = source?.kind === "scripture" && source.chapter !== undefined;

  async function save(remove = false) {
    if (busy.current || !source) return;
    let next = whole!;
    if (!remove && part && scripture) {
      const first = Number(start); const last = Number(end);
      if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || (verseCount && last > verseCount)) {
        setError(verseCount ? `Choose verses between 1 and ${verseCount}, in order.` : "Choose a valid verse range, in order."); return;
      }
      next = { ...next, label: `${whole!.label}:${first}${last === first ? "" : `-${last}`}`, href: `${whole!.href}#v-${first}`, verseStart: first, verseEnd: last };
    }
    if (!remove && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Choose the day you read it."); return; }
    busy.current = true; setSaving(true); setError(null);
    try { await onChange(remove ? null : { source: next, journalDate: date }); close(); }
    catch { setError("Your reading wasn't saved. Check the details and try again."); }
    finally { busy.current = false; setSaving(false); }
  }

  if (!value && options.length === 0) return null;
  return (
    <div ref={root} className="relative w-fit max-w-full">
      <button ref={trigger} type="button" onClick={edit} disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        aria-label={value ? `Edit reading: ${value.source.label}` : "Log reading"}
        className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50 ${value ? "border-[color:var(--accent-secondary)] bg-[color:var(--accent-note)] text-foreground hover:bg-[color:var(--surface-button-hover)]" : "border-dashed border-[color:var(--surface-border)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-button-hover)]"}`}>
        <FontAwesomeIcon icon={value ? faBookOpen : faPlus} className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{value ? `Read ${value.source.label}` : "Log reading"}</span>
        {value ? <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> : null}
      </button>
      {open && source ? (
        <div ref={panel} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1}
          className={`absolute ${align === "end" ? "right-0 w-[min(22rem,calc(100vw-7rem))]" : "left-0 w-[min(22rem,calc(100vw-4rem))]"} top-full z-50 mt-2 max-h-[65dvh] space-y-4 overflow-y-auto rounded-2xl border border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-4 text-sm text-foreground shadow-[var(--surface-shadow-lift)] outline-none`}
          onKeyDown={event => {
            if (event.key === "Escape" && !busy.current) { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); void save(); }
          }}>
          <h3 id={`${id}-title`} className="font-bold">{value ? "Edit reading" : "Log reading"}</h3>
          {readingOptions.length > 1 ? <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-xs font-semibold text-[color:var(--foreground-muted)]">Passage or guide</legend>
            {readingOptions.map((option, index) => <label key={index} className="flex items-start gap-2"><input type="radio" name={`${id}-source`} checked={chapterSource(option.source).href === whole?.href} onChange={() => { setSource(option.source); setPart(false); }} /><span>{chapterSource(option.source).label}</span></label>)}
          </fieldset> : <p className="font-semibold">{whole?.label}</p>}
          {scripture ? <div className="space-y-3">
            <div role="group" aria-label="Reading range" className="segmented-control flex">
              <button type="button" aria-pressed={!part} disabled={saving} onClick={() => setPart(false)} className="segmented-control-button flex-1" data-active={!part}>Whole chapter</button>
              <button type="button" aria-pressed={part} disabled={saving} onClick={() => setPart(true)} className="segmented-control-button flex-1" data-active={part}>Verses</button>
            </div>
            {part ? <div className="flex items-center gap-2">
              <label className="min-w-0 flex-1 space-y-1 text-xs">First verse<input type="number" min={1} max={verseCount} value={start} disabled={saving} onChange={event => setStart(event.target.value)} className="block h-9 w-full min-w-0 rounded-lg border border-[color:var(--surface-border)] bg-transparent px-2 text-sm" /></label>
              <label className="min-w-0 flex-1 space-y-1 text-xs">Last verse<input type="number" min={1} max={verseCount} value={end} disabled={saving} onChange={event => setEnd(event.target.value)} className="block h-9 w-full min-w-0 rounded-lg border border-[color:var(--surface-border)] bg-transparent px-2 text-sm" /></label>
            </div> : null}
          </div> : null}
          <label className="block space-y-1 text-xs font-semibold">Read on<input type="date" value={date} disabled={saving} onChange={event => setDate(event.target.value)} className="block h-9 rounded-lg border border-[color:var(--surface-border)] bg-transparent px-2 text-sm" /></label>
          {error ? <p role="alert" className="text-xs text-[color:var(--accent-rubric)]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {value ? <button type="button" disabled={saving || !canRemove} onClick={() => void save(true)} className="mr-auto text-xs text-[color:var(--accent-rubric)] disabled:opacity-50">Remove reading</button> : <span className="mr-auto" />}
            <button type="button" onClick={close} disabled={saving} className="surface-button rounded-full border px-3 py-2 text-xs font-semibold">Cancel</button>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-full bg-[color:var(--surface-button-active)] px-3 py-2 text-xs font-semibold text-[color:var(--surface-button-active-text)]">{saving ? "Saving…" : value ? "Save reading" : "Log reading"}</button>
          </div>
          {value && !canRemove ? <p className="text-xs text-[color:var(--foreground-muted)]">Add a note before removing the reading.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
