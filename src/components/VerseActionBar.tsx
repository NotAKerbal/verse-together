"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { positionSelectionPopover } from "@/lib/selectionPopover";
import MarkSample from "@/features/annotations/MarkSample";
import MarkStylePicker, { type MarkStyle } from "@/features/annotations/MarkStylePicker";
import {
  markPresetFullLabel,
  markPresetKey,
  markPresetPhrase,
  presetState,
  type MarkPreset,
  type SelectionMarks,
} from "@/features/annotations/verseAnnotations";

export type VerseActionAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * The reader's mark presets across the top of the menu (each a highlight or an underline in one color, in the
 * order chosen in account settings), for every selected verse at once. Each shows only its mark; a name given in
 * account settings is in its label and tooltip, and in full in the Annotate panel. "signedOut" buttons
 * ask the reader to sign in; "loading" ones wait for the reader's saved marks. With no presets the row keeps
 * just the close button. Annotate opens a panel in the menu with the same presets, any other style and color
 * (onMark takes any MarkPreset), and the full note editor (onAnnotation).
 */
export type VerseQuickMarks = {
  presets: readonly MarkPreset[];
  marks: SelectionMarks;
  status: "signedOut" | "loading" | "ready";
  pending?: boolean;
  error?: string | null;
  onMark: (preset: MarkPreset) => void;
  onSignIn: () => void;
  /** What is selected, for the marks' labels: verses (the default), or a passage of other text (a study guide). */
  scope?: "verses" | "text";
};

type Props = {
  visible: boolean;
  anchorRect: VerseActionAnchorRect | null;
  hasSelection: boolean;
  hasActiveInsight?: boolean;
  selectionReference: string;
  /** Which selection the menu is on, when the reference alone doesn't say (two selections can share one). */
  selectionKey?: string;
  selectedText: string;
  selectedWord?: string;
  /** Without it the top bar holds only the close button. */
  quickMarks?: VerseQuickMarks;
  annotationTitle?: string;
  annotationDescription?: string;
  /** The Annotate panel's note action ("Write a note", "Edit your note"…), which opens the full editor. */
  noteLabel?: string;
  noteDescription?: string;
  /** More of the Annotate panel, between the marks and the note action (a guide's saved passages there). */
  annotateExtra?: ReactNode;
  /** The full editor can't open yet (marks are saving); marking stays available. */
  annotationDisabled?: boolean;
  showInsightAction?: boolean;
  showExplore?: boolean;
  showTranslations?: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  /** The insight action shows only with both handlers (and showInsightAction): a reader without insights leaves them out. */
  onInsight?: () => void;
  onNewInsight?: () => void;
  /** The insight action is adding the selection (it can't be pressed again meanwhile). */
  insightPending?: boolean;
  /** Why the insight action's last try failed, shown until the next one. */
  insightError?: string | null;
  onAnnotation: () => void;
  /** Without it there is no Resources action (a reader with no resources panel). */
  onResources?: () => void;
  onExplore?: () => void;
  onTranslations?: () => void;
  shareHref?: string | null;
  targetLabel?: string;
};

const ICON_PATHS = {
  add: ["M12 5v14", "M5 12h14"],
  note: ["M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "m16 3 5 5-9 9-5 1 1-5Z"],
  book: ["M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z", "M12 6v14"],
  spark: ["m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"],
  translate: ["M3 5h12", "M9 3v2c0 6-3 9-6 11", "M5 9c1 3 4 6 7 7", "m13 17 4-10 4 10", "M15 13h4"],
  focus: ["M8 3H5a2 2 0 0 0-2 2v3", "M16 3h3a2 2 0 0 1 2 2v3", "M21 16v3a2 2 0 0 1-2 2h-3", "M8 21H5a2 2 0 0 1-2-2v-3", "M8 9h8", "M8 13h5"],
  copy: ["M9 9h11v12H9Z", "M5 16H3V3h12v2"],
  check: ["m5 12 4 4L19 6"],
  close: ["m6 6 12 12", "M18 6 6 18"],
  back: ["m15 18-6-6 6-6"],
} as const;

function ActionIcon({ kind }: { kind: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[kind].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function preserveSelection(event: MouseEvent<HTMLElement>) {
  // Leave auxiliary clicks and the browser's link menu available.
  if (event.button === 0) event.preventDefault();
}

function CopySelection({ text }: { text: string }) {
  const [notice, setNotice] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("copied");
    } catch {
      setNotice("failed");
    }
  }

  return (
    <button type="button" className="selection-copy" onMouseDown={preserveSelection} onClick={() => void copyText()} data-notice={notice}>
      <ActionIcon kind={notice === "copied" ? "check" : "copy"} />
      <span aria-live="polite">{notice === "copied" ? "Copied" : notice === "failed" ? "Couldn't copy · retry" : "Copy text"}</span>
    </button>
  );
}

/** The arrow keys, Home, and End move between a toolbar's buttons. */
function onToolbarKeyDown(event: KeyboardEvent<HTMLElement>) {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!step && event.key !== "Home" && event.key !== "End") return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home" ? buttons[0]
    : event.key === "End" ? buttons[buttons.length - 1]
    : buttons[(index + step + buttons.length) % buttons.length];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * What a mark button does: marks (or unmarks) the selected verses, or asks a signed-out reader to sign in.
 * Buttons that can't act stay focusable (aria-disabled), so a keyboard reader never loses their place.
 */
export function markAction(quickMarks: VerseQuickMarks | undefined) {
  const loading = quickMarks?.status === "loading";
  return (preset: MarkPreset) => {
    if (!quickMarks || loading) return;
    if (quickMarks.status === "signedOut") quickMarks.onSignIn();
    else quickMarks.onMark(preset);
  };
}

function markHint(quickMarks: VerseQuickMarks | undefined) {
  if (quickMarks?.status === "signedOut") return quickMarks.scope === "text" ? "Sign in to mark text" : "Sign in to mark verses";
  return quickMarks?.status === "loading" ? "Loading your marks…" : null;
}

function DismissButton({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" className="selection-dismiss" aria-label="Clear selection" title="Clear selection (Esc)" onMouseDown={preserveSelection} onClick={onClear}>
      <ActionIcon kind="close" />
    </button>
  );
}

function QuickMarkBar({ quickMarks, onClear }: { quickMarks?: VerseQuickMarks; onClear: () => void }) {
  const presets = quickMarks?.presets ?? [];
  const empty = presets.length === 0;
  const status = quickMarks?.status;
  const loading = status === "loading";
  const hint = markHint(quickMarks);
  const mark = markAction(quickMarks);

  return (
    <div className="selection-quickbar" data-empty={empty ? "true" : undefined}>
      {quickMarks && !empty ? (
        <div
          className="selection-quickmarks"
          role="toolbar"
          aria-label={quickMarks.scope === "text" ? "Quick marks for the selected text" : "Quick marks for the selected verses"}
          aria-busy={quickMarks.pending || loading || undefined}
          data-status={status}
          onKeyDown={onToolbarKeyDown}
        >
          {presets.map((preset) => {
            const label = markPresetFullLabel(preset);
            const pressed = presetState(preset, quickMarks.marks);
            return (
              <button
                key={markPresetKey(preset)}
                type="button"
                className="selection-preset"
                data-kind={preset.kind}
                data-color={preset.color}
                aria-label={label}
                aria-pressed={pressed}
                aria-disabled={loading || undefined}
                title={hint ?? (pressed === true ? `Remove ${markPresetPhrase(preset)}` : label)}
                onMouseDown={preserveSelection}
                onClick={() => mark(preset)}
              >
                <MarkSample preset={preset} />
              </button>
            );
          })}
        </div>
      ) : null}
      <DismissButton onClear={onClear} />
    </div>
  );
}

function markStateText(state: boolean | "mixed", scope: VerseQuickMarks["scope"]) {
  if (scope === "text") {
    return state === true ? "On the selected text" : state === "mixed" ? "On a saved passage overlapping it" : "Not on the selected text";
  }
  return state === true ? "On every selected verse" : state === "mixed" ? "On some selected verses" : "Not on the selected verses";
}

/**
 * The Annotate panel, in place of the menu's actions: the reader's presets (named in full), any style and
 * color with an Apply button, and the full note editor. Each mark puts itself on every selected verse, or
 * takes itself off when every one has it, and never touches a note or the other kind of mark. Back (or
 * Escape) returns to the actions.
 */
export function AnnotatePanel({
  quickMarks,
  noteLabel,
  noteDescription,
  noteDisabled,
  extra,
  onNote,
  onBack,
  onClear,
}: {
  quickMarks: VerseQuickMarks;
  noteLabel: string;
  noteDescription: string;
  noteDisabled: boolean;
  extra?: ReactNode;
  onNote: () => void;
  onBack: () => void;
  onClear: () => void;
}) {
  const titleId = useId();
  const presetsId = useId();
  const customId = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const [custom, setCustom] = useState<MarkStyle>(() => {
    const first = quickMarks.presets[0];
    return first ? { kind: first.kind, color: first.color } : { kind: "highlight", color: "yellow" };
  });
  const loading = quickMarks.status === "loading";
  const hint = markHint(quickMarks);
  const mark = markAction(quickMarks);
  const customState = presetState(custom, quickMarks.marks);
  const customPhrase = markPresetPhrase(custom);
  const customAction = customState === true ? `Remove ${customPhrase}` : `Apply ${customPhrase}`;

  // Opening the panel moves focus into it (its Back button), so a keyboard reader lands on the new choices.
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    // Escape steps back to the actions; a second Escape clears the selection as before.
    event.preventDefault();
    event.stopPropagation();
    onBack();
  }

  return (
    <div className="selection-annotate" role="group" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="selection-quickbar selection-annotate-bar">
        <button
          ref={backRef}
          type="button"
          className="selection-back"
          aria-label="Back to selection actions"
          title="Back (Esc)"
          onMouseDown={preserveSelection}
          onClick={onBack}
        >
          <ActionIcon kind="back" />
        </button>
        <h3 id={titleId} className="selection-annotate-title">Annotate</h3>
        <DismissButton onClear={onClear} />
      </div>

      <div className="selection-annotate-body" aria-busy={quickMarks.pending || loading || undefined} data-status={quickMarks.status}>
        <section className="selection-annotate-section" aria-labelledby={presetsId}>
          <h4 id={presetsId} className="selection-annotate-label">Your quick marks</h4>
          {quickMarks.presets.length > 0 ? (
            <div className="selection-annotate-presets" role="toolbar" aria-labelledby={presetsId} onKeyDown={onToolbarKeyDown}>
              {quickMarks.presets.map((preset) => {
                const label = markPresetFullLabel(preset);
                const pressed = presetState(preset, quickMarks.marks);
                return (
                  <button
                    key={markPresetKey(preset)}
                    type="button"
                    className="selection-annotate-preset"
                    aria-pressed={pressed}
                    aria-disabled={loading || undefined}
                    title={hint ?? (pressed === true ? `Remove ${markPresetPhrase(preset)}` : label)}
                    onMouseDown={preserveSelection}
                    onClick={() => mark(preset)}
                  >
                    <MarkSample preset={preset} />
                    <span className="selection-annotate-preset-label">{label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="selection-annotate-empty">No quick marks saved. Choose them in account settings.</p>
          )}
        </section>

        <section className="selection-annotate-section" aria-labelledby={customId}>
          <h4 id={customId} className="selection-annotate-label">Any style and color</h4>
          <MarkStylePicker value={custom} onChange={setCustom} label="Mark" keepSelection disabled={loading} className="selection-annotate-picker" />
          <div className="selection-annotate-apply-row">
            <button
              type="button"
              className="selection-annotate-apply"
              data-state={customState === true ? "on" : customState === "mixed" ? "mixed" : "off"}
              aria-disabled={loading || undefined}
              title={hint ?? undefined}
              onMouseDown={preserveSelection}
              onClick={() => mark(custom)}
            >
              <MarkSample preset={custom} />
              <span>{customAction}</span>
            </button>
            <span className="selection-annotate-state" aria-live="polite">{markStateText(customState, quickMarks.scope)}</span>
          </div>
        </section>

        {extra}

        <button
          type="button"
          className="selection-action selection-annotate-note"
          aria-disabled={noteDisabled || undefined}
          onMouseDown={preserveSelection}
          onClick={() => {
            if (!noteDisabled) onNote();
          }}
        >
          <ActionLabel icon="note" title={noteLabel} description={noteDescription} />
        </button>
      </div>
    </div>
  );
}

function ActionLabel({ icon, title, description }: {
  icon: keyof typeof ICON_PATHS;
  title: string;
  description: string;
}) {
  return (
    <>
      <span className="selection-action-icon"><ActionIcon kind={icon} /></span>
      <span className="selection-action-label">
        <span className="selection-action-title">{title}</span>
        <span className="selection-action-description">{description}</span>
      </span>
    </>
  );
}

type CardBodyProps = Omit<Props, "visible" | "anchorRect" | "hasSelection" | "selectedText" | "selectionReference" | "selectionKey"> & {
  selectionKey: string;
};

/**
 * The menu between its header and footer: the actions, or the Annotate panel. Mounted only while the menu
 * shows, so it reopens on the actions; the panel belongs to the selection it was opened on.
 */
function SelectionCardBody({
  selectionKey, quickMarks, annotateExtra, annotationTitle = "Annotate", annotationDescription = "Mark what matters",
  annotationDisabled = false, noteLabel = "Write a note", noteDescription = "Note and marks together",
  hasActiveInsight, selectedWord, showInsightAction = true, showExplore = false, showTranslations = false,
  actionsEnabled = true, onClear, onInsight, onNewInsight, insightPending = false, insightError = null, onAnnotation,
  onResources, onExplore, onTranslations, shareHref, targetLabel = "Note",
}: CardBodyProps) {
  // The selection the Annotate panel is open on, or null: a new selection reopens on the actions.
  const [annotating, setAnnotating] = useState<string | null>(null);
  const annotateRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  if (annotating !== null && annotating !== selectionKey) setAnnotating(null);
  const panelOpen = !!quickMarks && annotating === selectionKey;

  // Back from the panel puts focus on Annotate again.
  useEffect(() => {
    if (panelOpen || !returnFocus.current) return;
    returnFocus.current = false;
    annotateRef.current?.focus({ preventScroll: true });
  }, [panelOpen]);

  function onAnnotate() {
    // Without quick marks (a reader that doesn't offer them) Annotate is the full editor, as it was.
    if (!quickMarks) {
      if (!annotationDisabled) onAnnotation();
      return;
    }
    setAnnotating(selectionKey);
  }

  if (panelOpen) {
    return (
      <>
        <AnnotatePanel
          quickMarks={quickMarks}
          noteLabel={noteLabel}
          noteDescription={noteDescription}
          noteDisabled={!actionsEnabled || annotationDisabled}
          extra={annotateExtra}
          onNote={onAnnotation}
          onBack={() => {
            returnFocus.current = true;
            setAnnotating(null);
          }}
          onClear={onClear}
        />
        {quickMarks.error ? <p className="selection-quick-error" role="alert">{quickMarks.error}</p> : null}
      </>
    );
  }

  return (
    <>
      <QuickMarkBar quickMarks={quickMarks} onClear={onClear} />
      {quickMarks?.error ? <p className="selection-quick-error" role="alert">{quickMarks.error}</p> : null}
      {insightError ? <p className="selection-quick-error" role="alert">{insightError}</p> : null}

      <div className="selection-actions">
        {showExplore && onExplore ? (
          <button type="button" className="selection-action" data-featured="true" onMouseDown={preserveSelection} onClick={onExplore}>
            <ActionLabel icon="spark" title={`Explore${selectedWord ? ` “${selectedWord}”` : ""}`} description="Meaning & context" />
          </button>
        ) : null}
        {showInsightAction && onInsight && onNewInsight ? (
          <button
            type="button"
            className="selection-action"
            onMouseDown={preserveSelection}
            onClick={hasActiveInsight ? onInsight : onNewInsight}
            disabled={!actionsEnabled || insightPending}
            aria-busy={insightPending || undefined}
          >
            <ActionLabel
              icon="add"
              title={hasActiveInsight ? `Add to ${targetLabel}` : `New ${targetLabel}`}
              description={!actionsEnabled ? "Sign in to save" : insightPending ? "Adding…" : "Keep your thoughts"}
            />
          </button>
        ) : null}
        <button
          ref={annotateRef}
          type="button"
          className="selection-action"
          onMouseDown={preserveSelection}
          onClick={onAnnotate}
          disabled={!actionsEnabled || (!quickMarks && annotationDisabled)}
        >
          <ActionLabel icon="note" title={annotationTitle} description={actionsEnabled ? annotationDescription : "Sign in to annotate"} />
        </button>
        {onResources ? (
          <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={onResources}>
            <ActionLabel icon="book" title="Resources" description="Lessons & more" />
          </button>
        ) : null}
        {showTranslations && onTranslations ? (
          <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={onTranslations}>
            <ActionLabel icon="translate" title="Translations" description="Compare the wording" />
          </button>
        ) : null}
        {shareHref ? (
          <a href={shareHref} className="selection-action" data-featured="true" aria-label="Focus scripture for the selected verses" onMouseDown={preserveSelection}>
            <ActionLabel icon="focus" title="Focus scripture" description="Read & share passage" />
          </a>
        ) : null}
      </div>
    </>
  );
}

export default function VerseActionBar({
  visible, anchorRect, hasSelection, selectionReference, selectionKey, selectedText, ...cardProps
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!visible || !hasSelection || !anchorRect || !popover) return;

    function updatePosition() {
      if (!popover || !anchorRect) return;
      const position = positionSelectionPopover(anchorRect, popover.getBoundingClientRect(), {
        width: window.innerWidth, height: window.innerHeight,
      });
      popover.style.top = `${position.top}px`;
      popover.style.left = `${position.left}px`;
      popover.style.setProperty("--selection-pointer-x", `${position.pointerLeft}px`);
      popover.dataset.placement = position.placement;
      popover.dataset.overlap = String(position.overlapsSelection);
      popover.dataset.ready = "true";
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(popover);
    return () => observer.disconnect();
  }, [visible, hasSelection, anchorRect]);

  if (!visible || !hasSelection || !anchorRect) return null;

  return (
    <div ref={popoverRef} data-selection-popover="true" className="selection-popover" role="dialog" aria-label="Selection actions" aria-describedby={headingId}>
      <div className="selection-card">
        <SelectionCardBody selectionKey={selectionKey ?? selectionReference} {...cardProps} />

        <footer className="selection-card-footer">
          <CopySelection key={selectedText} text={selectedText} />
          <h2 id={headingId} className="selection-footer-reference">{selectionReference}</h2>
        </footer>
      </div>
      <span className="selection-pointer" aria-hidden="true" />
    </div>
  );
}
