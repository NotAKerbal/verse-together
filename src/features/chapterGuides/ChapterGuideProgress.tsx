import { chapterGuideElapsedLabel, type ChapterGuideGenerating, chapterGuideProgress } from "@/lib/chapterGuideView";
import styles from "./ChapterGuideProgress.module.css";

const REASSURANCE = "It can take several minutes, and you can keep reading or come back later. Once it’s done, it’s saved here for everyone.";
const STEP_STATUS_TEXT = { done: "done", current: "in progress", upcoming: "not started" };

export default function ChapterGuideProgress({ reference, generating, now }: { reference: string; generating: ChapterGuideGenerating; now: number | null }) {
  const progress = chapterGuideProgress(generating.stage, generating);
  const elapsed = now === null ? "" : `${chapterGuideElapsedLabel(generating.startedAt, now)} `;
  const intro = `A guide for ${reference} is being written.`;
  if (!progress) {
    return <p className={styles.note} role="status">{intro} {elapsed}{REASSURANCE}</p>;
  }
  const { steps, completedSteps, stepNumber, activity, correctionsMayFollow } = progress;
  const position = `Step ${stepNumber} of ${steps.length}: ${activity}`;
  return (
    <div className={styles.progress}>
      <p className={styles.note}>{intro}</p>
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
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.key} className={styles.step} data-status={step.status} aria-current={step.status === "current" ? "step" : undefined}>
            {step.status === "done" ? <span aria-hidden="true">✓ </span> : null}
            {step.label}
            <span className="sr-only">, {STEP_STATUS_TEXT[step.status]}</span>
          </li>
        ))}
      </ol>
      <p className={styles.note}>
        {correctionsMayFollow ? "If a review asks for corrections, more steps follow. " : ""}
        {elapsed}{REASSURANCE}
      </p>
    </div>
  );
}
