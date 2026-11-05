import { chapterGuideElapsedLabel, type ChapterGuideGenerating, chapterGuideProgress } from "@/lib/chapterGuideView";
import styles from "./ChapterGuideProgress.module.css";

const STEP_STATUS_TEXT = { done: "done", current: "in progress", upcoming: "not started" };
const COMPACT_STEP_LABEL_LIMIT = 3;

export default function ChapterGuideProgress({ reference, generating, now, compact = false }: { reference: string; generating: ChapterGuideGenerating; now: number | null; compact?: boolean }) {
  const progress = chapterGuideProgress(generating.stage, generating);
  const rootClass = `${styles.progress} ${compact ? styles.compact : styles.full}`;
  const lead = <p className={styles.lead}>{compact ? `A guide for ${reference} is being written.` : "This guide is being written."}</p>;
  const elapsed = now === null ? null : <p className={styles.elapsed}>{chapterGuideElapsedLabel(generating.startedAt, now)}</p>;
  if (!progress) {
    return <div className={rootClass} role="status">{lead}{elapsed}</div>;
  }
  const { steps, completedSteps, stepNumber, activity } = progress;
  const position = `Step ${stepNumber} of ${steps.length}: ${activity}`;
  return (
    <div className={rootClass}>
      {lead}
      <p className={styles.status} role="status">{position}</p>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Chapter guide progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completedSteps}
        aria-valuetext={position}
      >
        {steps.map((step) => <span key={step.key} className={styles.segment} data-status={step.status} />)}
      </div>
      {!compact || steps.length <= COMPACT_STEP_LABEL_LIMIT ? (
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.key} className={styles.step} data-status={step.status} aria-current={step.status === "current" ? "step" : undefined}>
              {step.status === "done" ? <span aria-hidden="true">✓ </span> : null}
              {step.label}
              <span className="sr-only">, {STEP_STATUS_TEXT[step.status]}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {elapsed}
    </div>
  );
}
