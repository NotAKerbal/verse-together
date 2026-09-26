type Props = {
  value: number;
  max: number;
  label: string;
  showCount?: boolean;
  className?: string;
};

export default function ProgressBar({ value, max, label, showCount = true, className = "" }: Props) {
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(safeMax, value));
  const complete = max > 0 && clamped >= safeMax;
  const percent = Math.round((clamped / safeMax) * 100);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-label={label}
        className="h-3 flex-1 overflow-hidden rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)]"
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${percent}%`,
            background: complete ? "var(--accent-mint)" : "var(--accent-primary)",
          }}
        />
      </div>
      {showCount ? (
        <span className="shrink-0 text-[0.7rem] font-bold tabular-nums text-[color:var(--foreground-muted)]">
          {clamped}/{max}
        </span>
      ) : null}
    </div>
  );
}
