"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import { readLocalPreferences, writeLocalMarkPresets } from "@/lib/preferences";
import { api } from "../../../convex/_generated/api";
import {
  DEFAULT_MARK_PRESETS,
  MARK_COLORS,
  MARK_KINDS,
  MARK_PRESET_NAME_MAX,
  MARK_PRESETS_MAX,
  normalizeMarkPreset,
  normalizeMarkPresetName,
  normalizeMarkPresets,
  readMarkPresets,
  sameMarkPreset,
  sameNamedMarkPreset,
  type MarkColor,
  type MarkKind,
  type MarkPreset,
} from "../../../convex/annotationRules";
import MarkSample from "./MarkSample";
import MarkStylePicker, { type MarkStyle } from "./MarkStylePicker";
import { markPresetFullLabel, markPresetLabel, markPresetPhrase } from "./verseAnnotations";
import styles from "@/app/account/page.module.css";

/** The same list, names included: a rename is a change. */
function samePresets(a: readonly MarkPreset[], b: readonly MarkPreset[]) {
  return a.length === b.length && a.every((preset, index) => sameNamedMarkPreset(preset, b[index]));
}

function has(presets: readonly MarkPreset[], preset: MarkStyle) {
  return presets.some((item) => sameMarkPreset(item, preset));
}

/** For a picker: the style is another quick mark already (any but the one at `except`). */
function takenBy(presets: readonly MarkPreset[], except: number | null) {
  return (style: MarkStyle) => {
    const at = presets.findIndex((item, index) => index !== except && sameMarkPreset(item, style));
    return at >= 0 ? `already quick mark ${at + 1}` : null;
  };
}

const NAME_HELP_ID = "quick-mark-name-help";

/**
 * A preset's optional name. It saves when the field is left (or on Enter), not on every keystroke; Escape
 * puts back the saved name. While the field isn't being edited it follows the saved name.
 */
function PresetNameField({
  name,
  label,
  disabled,
  onCommit,
  dataFocus,
}: {
  name: string | undefined;
  label: string;
  disabled?: boolean;
  onCommit: (name: string | undefined) => void;
  dataFocus?: string;
}) {
  const [value, setValue] = useState(name ?? "");
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(name);
  if (!editing && shown !== name) {
    setShown(name);
    setValue(name ?? "");
  }
  const countId = useId();

  function commit() {
    setEditing(false);
    const next = normalizeMarkPresetName(value);
    setValue(next ?? "");
    if (next !== (name || undefined)) onCommit(next);
  }

  return (
    <span className={styles.quickMarkNameField} data-editing={editing || undefined}>
      <input
        type="text"
        className={styles.quickMarkInput}
        aria-label={label}
        aria-describedby={`${NAME_HELP_ID} ${countId}`}
        aria-disabled={disabled || undefined}
        readOnly={disabled}
        placeholder="Name (optional)"
        maxLength={MARK_PRESET_NAME_MAX}
        autoComplete="off"
        spellCheck
        data-focus={dataFocus}
        value={value}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setEditing(true);
          setValue(event.target.value);
        }}
        onBlur={() => {
          if (editing) commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setValue(name ?? "");
            setEditing(false);
          }
        }}
      />
      <span id={countId} className={styles.quickMarkCount} aria-hidden={!editing || undefined}>
        {value.length}/{MARK_PRESET_NAME_MAX}
      </span>
    </span>
  );
}

/** The first color of a kind not in the list, or null when it has them all. */
function firstUnusedColor(presets: readonly MarkPreset[], kind: MarkKind): MarkColor | null {
  return MARK_COLORS.find((color) => !has(presets, { kind, color })) ?? null;
}

/** The first kind-and-color pair not in the list (highlights first), for the add row. */
function firstUnused(presets: readonly MarkPreset[]): MarkPreset | null {
  for (const kind of MARK_KINDS) {
    const color = firstUnusedColor(presets, kind);
    if (color) return { kind, color };
  }
  return null;
}

type Focus = { index: number; control: "up" | "down" | "remove" } | "add";

/**
 * Account settings: the mark presets across the top of the reader's selection menu, each a highlight or an
 * underline in one color (a red underline, a yellow highlight, a blue highlight…), in the order they show,
 * each optionally named ("Blessings"). Style and color are picked visually (MarkStylePicker).
 * Saved to the account on their own, so they never reset the reader's other settings; the menu's Annotate
 * action keeps every option whatever is chosen here.
 *
 * Changes save one after another, each the whole list: the list shown is the last change made, so quick
 * successive edits (moving a mark up twice) never lose one to a save still in flight.
 */
export default function QuickMarkSettings() {
  const { ready } = useConvexSignedIn();
  const saved = useQuery(api.preferences.getReaderPreferences, ready ? {} : "skip");
  const save = useMutation(api.preferences.saveMarkPresets).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.preferences.getReaderPreferences, {});
    if (current) store.setQuery(api.preferences.getReaderPreferences, {}, { ...current, markPresets: normalizeMarkPresets(args.presets) ?? [] });
  });
  const loading = saved === undefined;
  // No saved preferences yet means the reader never chose: the defaults.
  const savedPresets = readMarkPresets(saved);
  // The list as of the last change, until every save is done (then the account's, live).
  const [draft, setDraft] = useState<MarkPreset[] | null>(null);
  const draftRef = useRef<MarkPreset[] | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const mountedRef = useRef(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const presets = draft ?? savedPresets;
  const [adding, setAdding] = useState<MarkPreset | null>(null);
  const addCandidate = adding && !has(presets, adding) ? adding : firstUnused(presets);
  const listRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep focus on the control that moved (or the next one, after a removal) once the list re-renders.
  useEffect(() => {
    if (!focus || !listRef.current) return;
    const target =
      focus === "add"
        ? listRef.current.querySelector<HTMLElement>("[data-focus='add']")
        : listRef.current.querySelector<HTMLElement>(`[data-index='${focus.index}'] [data-focus='${focus.control}']`) ??
          listRef.current.querySelector<HTMLElement>("[data-focus='add']");
    target?.focus();
    setFocus(null);
  }, [focus]);

  function change(next: MarkPreset[]) {
    if (loading) return;
    const base = draftRef.current ?? savedPresets;
    if (samePresets(base, next)) return;
    draftRef.current = next;
    setDraft(next);
    setError(null);
    pendingRef.current += 1;
    setPending(pendingRef.current);
    const local = readLocalPreferences();
    queue.current = queue.current.then(async () => {
      // Leaving account settings (including signing out) cancels changes not yet sent.
      if (!mountedRef.current) return;
      try {
        const result = await save({
          presets: next,
          // Only used when the account has no saved preferences yet, so this device's reader settings carry over.
          readerDefaults: local
            ? {
                showFootnotes: local.showFootnotes,
                fontScale: local.fontScale,
                fontFamily: local.fontFamily,
                comparisonView: local.comparisonView,
                textWidth: local.textWidth,
              }
            : undefined,
        });
        if (!mountedRef.current) return;
        writeLocalMarkPresets(result.markPresets);
        if (pendingRef.current === 1) setError(null);
      } catch {
        // A later queued save sends the complete, newer list and may recover this change.
        if (mountedRef.current && pendingRef.current === 1) setError("Couldn't save your quick marks. Try again.");
      } finally {
        pendingRef.current -= 1;
        if (mountedRef.current) setPending(pendingRef.current);
        if (mountedRef.current && pendingRef.current === 0) {
          // Every save is done: show the account's list again.
          draftRef.current = null;
          setDraft(null);
        }
      }
    });
  }

  /** The list as of the last change, so an edit made while an earlier one saves builds on it. */
  const current = () => draftRef.current ?? savedPresets;

  /** A new style for one preset; its name stays. */
  function edit(index: number, style: MarkStyle) {
    const list = current();
    const duplicate = list.findIndex((item, at) => at !== index && sameMarkPreset(item, style));
    if (duplicate >= 0) {
      setError(`${markPresetLabel(style)} is already quick mark ${duplicate + 1}.`);
      return;
    }
    change(list.map((item, at) => (at === index ? normalizeMarkPreset({ ...item, ...style }) : item)));
  }

  /** A new name for one preset, or none. */
  function rename(index: number, name: string | undefined) {
    const list = current();
    if (!list[index]) return;
    change(list.map((item, at) => (at === index ? normalizeMarkPreset({ kind: item.kind, color: item.color, name }) : item)));
  }

  function move(index: number, by: -1 | 1) {
    const list = current();
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    change(next);
    setFocus({ index: to, control: by < 0 ? "up" : "down" });
  }

  function remove(index: number) {
    const list = current();
    change(list.filter((_, at) => at !== index));
    setFocus(list.length > 1 ? { index: Math.min(index, list.length - 2), control: "remove" } : "add");
  }

  function add() {
    const list = current();
    if (!addCandidate || list.length >= MARK_PRESETS_MAX) return;
    if (has(list, addCandidate)) return;
    change([...list, normalizeMarkPreset(addCandidate)]);
    setAdding(null);
    // Adding the last pair removes the add row: keep focus nearby.
    if (list.length + 1 >= MARK_PRESETS_MAX) setFocus("add");
  }

  const isDefault = samePresets(presets, DEFAULT_MARK_PRESETS);
  const summary = loading
    ? "Loading…"
    : presets.length === 0
      ? "None · Annotate still has every option"
      : `${presets.length} of ${MARK_PRESETS_MAX} · Your account`;
  const busy = loading || undefined;

  return (
    <div className={styles.quickMarkSetting} ref={listRef}>
      <div className={styles.quickMarkHeader}>
        <div>
          <span className={styles.settingTitle} id="quick-mark-settings-title">
            Quick marks
          </span>
          <p aria-live="polite">{pending > 0 ? "Saving…" : summary}</p>
        </div>
        <button
          type="button"
          className={styles.quickMarkTextButton}
          aria-disabled={loading || isDefault || undefined}
          onClick={() => {
            if (!isDefault) change(DEFAULT_MARK_PRESETS.map((preset) => ({ ...preset })));
          }}
        >
          Restore defaults
        </button>
      </div>
      <p id="quick-mark-settings-help">
        Buttons at the top of the menu when you select verses, in this order. Each highlights or underlines every selected verse in its color.
      </p>
      <p id={NAME_HELP_ID}>
        A name (Blessings, Commandments…) is optional, up to {MARK_PRESET_NAME_MAX} characters, and shows on its button.
      </p>
      {presets.length > 0 ? (
        <ol className={styles.quickMarkList} aria-labelledby="quick-mark-settings-title" aria-describedby="quick-mark-settings-help" aria-busy={busy}>
          {presets.map((preset, index) => {
            const label = markPresetLabel(preset);
            const phrase = markPresetPhrase(preset);
            const position = `Quick mark ${index + 1}`;
            return (
              <li key={index} className={styles.quickMarkRow} data-index={index}>
                <span className={styles.quickMarkRowHead}>
                  <MarkSample preset={preset} />
                  <span className={styles.quickMarkName} title={markPresetFullLabel(preset)}>
                    {preset.name ? (
                      <>
                        <span className={styles.quickMarkCustomName}>{preset.name}</span>
                        <span className={styles.quickMarkStyleName}>{label}</span>
                      </>
                    ) : (
                      label
                    )}
                  </span>
                  <span className={styles.quickMarkControls}>
                    <button
                      type="button"
                      className={styles.quickMarkIconButton}
                      data-focus="up"
                      aria-label={`Move ${phrase} up`}
                      aria-disabled={loading || index === 0 || undefined}
                      onClick={() => move(index, -1)}
                    >
                      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.quickMarkIconButton}
                      data-focus="down"
                      aria-label={`Move ${phrase} down`}
                      aria-disabled={loading || index === presets.length - 1 || undefined}
                      onClick={() => move(index, 1)}
                    >
                      <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.quickMarkIconButton}
                      data-focus="remove"
                      aria-label={`Remove ${phrase}`}
                      aria-disabled={busy}
                      onClick={() => remove(index)}
                    >
                      <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                    </button>
                  </span>
                </span>
                <span className={styles.quickMarkRowEdit}>
                  <PresetNameField name={preset.name} label={`${position} name`} disabled={loading} onCommit={(name) => rename(index, name)} />
                  <MarkStylePicker
                    value={preset}
                    label={position}
                    disabled={loading}
                    unavailable={takenBy(presets, index)}
                    onChange={(style) => edit(index, style)}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      ) : loading ? null : (
        <p className={styles.quickMarkEmpty}>No quick marks: the menu shows just its actions.</p>
      )}
      {addCandidate && presets.length < MARK_PRESETS_MAX ? (
        <div className={styles.quickMarkAdd} role="group" aria-label="Add a quick mark">
          <span className={styles.quickMarkRowHead}>
            <MarkSample preset={addCandidate} />
            <span className={styles.quickMarkName}>New quick mark</span>
            <span className={styles.quickMarkControls}>
              <button type="button" className={styles.quickMarkTextButton} data-focus="add" aria-disabled={busy} onClick={add}>
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Add {markPresetPhrase(normalizeMarkPreset(addCandidate))}
              </button>
            </span>
          </span>
          <span className={styles.quickMarkRowEdit}>
            <span className={styles.quickMarkNameField}>
              <input
                type="text"
                className={styles.quickMarkInput}
                aria-label="New quick mark name"
                aria-describedby={NAME_HELP_ID}
                placeholder="Name (optional)"
                maxLength={MARK_PRESET_NAME_MAX}
                autoComplete="off"
                spellCheck
                value={addCandidate.name ?? ""}
                onChange={(event) => setAdding({ ...addCandidate, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    add();
                  }
                }}
              />
            </span>
            <MarkStylePicker
              value={addCandidate}
              label="New quick mark"
              disabled={loading}
              unavailable={takenBy(presets, null)}
              onChange={(style) => setAdding({ ...addCandidate, ...style })}
            />
          </span>
        </div>
      ) : loading ? null : (
        <p className={styles.quickMarkEmpty} data-focus="add" tabIndex={-1}>
          Every highlight and underline color is a quick mark.
        </p>
      )}
      {error ? (
        <p className={styles.quickMarkError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
