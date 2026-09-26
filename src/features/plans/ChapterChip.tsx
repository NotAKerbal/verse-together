import Link from "next/link";

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

type Props = {
  href: string;
  label: string;
  /** Mint tint with a check. */
  read: boolean;
};

/** A pill link to a chapter (or the first chapter of a range), tinted mint once it's read. */
export default function ChapterChip({ href, label, read }: Props) {
  return (
    <Link
      href={href}
      data-tap
      aria-label={read ? `${label}, read` : undefined}
      className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] px-3 text-[0.8rem] font-bold text-[color:var(--foreground)] ${
        read ? "bg-[color:var(--accent-mint)]" : "bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-button-hover)]"
      }`}
    >
      {read ? <CheckIcon /> : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}
