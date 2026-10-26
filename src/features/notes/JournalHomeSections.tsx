"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faCalendarDays, faMinus, faPen, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { journalGoalsProblem, MAX_WEEKLY_REFLECTIONS, type JournalGoals } from "../../lib/journalGoals";
import { dateFromKey, formatMonthHeading, monthKeyOf, type JournalEntry } from "./journal";
import { journalHomeProgress, journalRevisit, REFLECTION_PROMPTS } from "./journalHome";
import styles from "./JournalHome.module.css";

export type JournalGoalControls = {
  goals: JournalGoals;
  loading: boolean;
  onSave: (goals: JournalGoals) => Promise<unknown>;
  saveErrorMessage?: string;
};

function shortDate(date: string) {
  return dateFromKey(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function JournalInvitation({ date, onWrite, disabled = false }: {
  date: string;
  onWrite: (date: string, prompt?: string) => void;
  disabled?: boolean;
}) {
  const [promptIndex, setPromptIndex] = useState(0);
  const prompt = REFLECTION_PROMPTS[promptIndex];
  return (
    <section className={styles.invitation} aria-label="An invitation to reflect">
      <div className={styles.invitationContent}>
        <h2>Make room for a little light.</h2>
        <p aria-live="polite" aria-atomic="true">{prompt}</p>
        <div className={styles.invitationActions}>
          <button type="button" className={styles.primaryButton} disabled={disabled} onClick={() => onWrite(date, prompt)}>
            <FontAwesomeIcon icon={faPen} aria-hidden="true" /> Write a reflection
          </button>
          <button type="button" className={styles.promptButton} onClick={() => setPromptIndex(index => (index + 1) % REFLECTION_PROMPTS.length)}>
            Choose another prompt
          </button>
        </div>
      </div>
    </section>
  );
}

function GoalProgress({ label, count, target, hint }: { label: string; count: number; target: number; hint: string }) {
  return (
    <div className={styles.goalCopy}>
      <h3>{label}</h3>
      <div className={styles.progressRow}>
        <progress aria-label={label} value={Math.min(count, target)} max={target} />
        <span className={styles.goalCount} aria-label={`${count} of ${target}`}>{count} <span>/ {target}</span></span>
      </div>
      <p>{hint}</p>
    </div>
  );
}

function GoalStepper({ label, hint, value, max, onChange }: {
  label: string; hint: string; value: number; max: number; onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.goalField}>
      <div><label htmlFor={id}>{label}</label><p id={`${id}-hint`}>{hint}</p></div>
      <div className={styles.stepper}>
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= 1}
          onClick={() => onChange(Math.max(1, (Number.isFinite(value) ? value : 1) - 1))}>
          <FontAwesomeIcon icon={faMinus} aria-hidden="true" />
        </button>
        <input id={id} type="number" inputMode="numeric" required min={1} max={max} step={1}
          aria-describedby={`${id}-hint`} value={Number.isFinite(value) ? value : ""}
          onChange={event => onChange(event.currentTarget.valueAsNumber)} />
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max}
          onClick={() => onChange(Math.min(max, (Number.isFinite(value) ? value : 0) + 1))}>
          <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function GoalEditor({ goals, onSave, onClose, saveErrorMessage }: {
  goals: JournalGoals; onSave: JournalGoalControls["onSave"]; onClose: () => void; saveErrorMessage?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(goals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  function dismiss() {
    dialogRef.current?.close();
    onClose();
  }

  async function save() {
    if (savingRef.current) return;
    const problem = journalGoalsProblem(draft);
    if (problem) { setError(problem); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      dismiss();
    } catch {
      setError(saveErrorMessage ?? "Your goals couldn't be saved. Your changes are still here; check your connection and try again.");
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!savingRef.current) dismiss(); }}>
      <form onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={saving}>
        <div className={styles.dialogHeading}>
          <h2 id={titleId}>Edit weekly goals</h2>
          <button type="button" className={styles.closeButton} aria-label="Close goal editor" disabled={saving} onClick={dismiss}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>
        <p id={descriptionId} className={styles.dialogDescription}>Choose a rhythm that works for you.</p>
        <fieldset disabled={saving} className={styles.goalFields}>
          <legend className="sr-only">Weekly targets</legend>
          <GoalStepper label="Study days per week" hint="1–7 days" value={draft.studyDays} max={7}
            onChange={studyDays => setDraft(current => ({ ...current, studyDays }))} />
          <GoalStepper label="Reflections per week" hint={`1–${MAX_WEEKLY_REFLECTIONS} notes each week`} value={draft.reflections} max={MAX_WEEKLY_REFLECTIONS}
            onChange={reflections => setDraft(current => ({ ...current, reflections }))} />
        </fieldset>
        {error ? <p role="alert" className={styles.saveError}>{error}</p> : null}
        <p className={styles.keepProgress}>Changing a goal keeps your recorded progress.</p>
        <div className={styles.dialogActions}>
          <button ref={cancelRef} type="button" className={styles.secondaryButton} disabled={saving} onClick={dismiss}>Cancel</button>
          <button type="submit" className={styles.primaryButton} aria-disabled={saving}>{saving ? "Saving…" : "Save goals"}</button>
        </div>
      </form>
    </dialog>
  );
}

export function JournalGoalsPanel({ entries, today, status, controls }: {
  entries: JournalEntry[]; today: string; status: "loading" | "ready"; controls?: JournalGoalControls;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const progress = useMemo(() => journalHomeProgress(entries, today), [entries, today]);
  const loading = status === "loading" || controls?.loading;
  function close() { setEditing(false); editRef.current?.focus(); }
  return (
    <div className={styles.railSummary}>
      <section aria-label="Weekly goals" className={styles.goals}>
        <div className={styles.goalsHeading}>
          <h2>Weekly goals</h2>
          {controls ? <button ref={editRef} type="button" className={styles.editButton} disabled={loading} aria-haspopup="dialog"
            onClick={() => { setSaved(false); setEditing(true); }}><FontAwesomeIcon icon={faPen} aria-hidden="true" /> Edit goals</button> : null}
        </div>
        <p className={styles.weekRange}>{shortDate(progress.week.start)} – {shortDate(progress.week.end)}</p>
        {loading || !controls ? <p role="status" className={styles.loading}>{loading ? "Loading your goals…" : "Your goals will appear here when your account is connected."}</p> : <>
          <div className={styles.goal}>
            <span className={styles.goalIcon}><FontAwesomeIcon icon={faBookOpen} aria-hidden="true" /></span>
            <GoalProgress label={`Study ${controls.goals.studyDays} ${controls.goals.studyDays === 1 ? "day" : "days"} a week`} count={progress.studyDays} target={controls.goals.studyDays}
              hint={progress.studyDays >= controls.goals.studyDays ? "Your weekly study goal is met. Keep a little light with you." : "A little time in scripture each day."} />
          </div>
          <div className={styles.goal}>
            <span className={styles.goalIcon}><FontAwesomeIcon icon={faPen} aria-hidden="true" /></span>
            <GoalProgress label={`Write ${controls.goals.reflections} ${controls.goals.reflections === 1 ? "reflection" : "reflections"} a week`} count={progress.reflections} target={controls.goals.reflections}
              hint={progress.reflections >= controls.goals.reflections ? "Your weekly reflection goal is met." : "Turn what you read into a note."} />
          </div>
        </>}
        <p role="status" className={styles.savedNotice}>{saved ? "Weekly goals saved." : ""}</p>
      </section>
      <section aria-label="This month's study" className={styles.monthSummary}>
        <div className={styles.goalsHeading}><h2>This month</h2><span>{formatMonthHeading(monthKeyOf(today))}</span></div>
        {status === "loading" ? <p role="status" className={styles.loading}>Loading your study days…</p> : <div className={styles.goal}>
          <span className={styles.goalIcon}><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /></span>
          <div className={styles.goalCopy}><h3>{progress.monthStudyDays} {progress.monthStudyDays === 1 ? "day" : "days"} of study</h3>
            <p>{progress.monthStudyDays ? "You're showing up. Keep going." : "A fresh moment to begin."}</p></div>
        </div>}
      </section>
      {editing && controls ? <GoalEditor goals={controls.goals} onClose={close} saveErrorMessage={controls.saveErrorMessage}
        onSave={async goals => { await controls.onSave(goals); setSaved(true); }} /> : null}
    </div>
  );
}

export function JournalRevisit({ entries, date, onOpen }: {
  entries: JournalEntry[]; date: string; onOpen: (id: string, date: string) => void;
}) {
  const note = useMemo(() => journalRevisit(entries, date), [entries, date]);
  if (!note) return null;
  return (
    <section className={styles.revisit} aria-label="A thought worth revisiting">
      <div className={styles.sectionHeading}><h2>A thought worth revisiting</h2><time dateTime={note.journal_date}>{shortDate(note.journal_date)}</time></div>
      <button type="button" className={styles.revisitNote} onClick={() => onOpen(note.id, note.journal_date)}>
        <span className={styles.goalIcon}><FontAwesomeIcon icon={faPen} aria-hidden="true" /></span>
        <span className={styles.revisitCopy}><strong>{note.title || "Untitled note"}</strong>{note.excerpt ? <span>{note.excerpt}</span> : null}</span>
        <span className={styles.openNote}>Open note</span>
      </button>
    </section>
  );
}
