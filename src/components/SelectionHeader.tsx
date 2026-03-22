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
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground/45">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-foreground/72 surface-card-soft"
                aria-label="Go back"
                data-tap
              >
                <BackIcon />
              </Link>
            ) : null}
            <h1 className="min-w-0 text-[1.55rem] font-semibold tracking-[-0.02em] sm:text-[1.8rem]">{title}</h1>
          </div>
        </div>
        {meta ? (
          <div className="shrink-0 pb-1 text-xs font-medium uppercase tracking-[0.14em] text-foreground/45">
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  );
}
