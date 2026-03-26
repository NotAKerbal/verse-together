import Link from "next/link";

type Props = {
  title: string;
  meta?: string;
  eyebrow?: string;
  backHref?: string;
};

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function SelectionHeader({
  title,
  meta,
  eyebrow,
  backHref,
}: Props) {
  return (
    <div className="page-hero mobile-menu-clearance">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="page-eyebrow mb-3">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="panel-card-soft inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)]"
                aria-label="Go back"
                data-tap
              >
                <BackIcon />
              </Link>
            ) : null}
            <h1 className="page-title min-w-0">{title}</h1>
          </div>
        </div>
        {meta ? (
          <div className="page-meta shrink-0">
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  );
}
