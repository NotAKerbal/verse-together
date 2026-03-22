import Link from "next/link";
import SelectionHeader from "@/components/SelectionHeader";

const commonVolumes = [
  {
    id: "bookofmormon",
    label: "Book of Mormon",
    shortLabel: "15 books",
  },
  {
    id: "oldtestament",
    label: "Old Testament",
    shortLabel: "39 books",
  },
  {
    id: "newtestament",
    label: "New Testament",
    shortLabel: "27 books",
  },
  {
    id: "dnc",
    label: "Doctrine & Covenants",
    shortLabel: "138 sections",
  },
  {
    id: "pearl",
    label: "Pearl of Great Price",
    shortLabel: "5 books",
  },
] as const;

function BrowseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 4.75A2.75 2.75 0 0 1 8.25 2h9.25v16.25H8.25A2.75 2.75 0 0 0 5.5 21V4.75Z" />
      <path d="M5.5 19.25A2.75 2.75 0 0 1 8.25 16.5H17.5V21H8.25A2.75 2.75 0 0 1 5.5 18.25v1Z" />
      <path d="M9 6.5h5.5" />
    </svg>
  );
}

function ChevronIcon() {
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
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ lessonId?: string | string[] }>;
}) {
  const query = await searchParams;
  const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
  const lessonSuffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : "";

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
      <SelectionHeader title="Volumes" meta={`${commonVolumes.length} collections`} />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {commonVolumes.map((volume) => (
          <li key={volume.id}>
            <Link
              href={`/browse/${volume.id}${lessonSuffix}`}
              className="group flex h-full flex-col rounded-[1.45rem] border px-4 py-4 surface-card"
              data-tap
            >
              <div className="flex items-start gap-3">
                <div
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-foreground/74"
                  style={{
                    background: "color-mix(in oklab, var(--surface-card-strong) 88%, transparent)",
                  }}
                >
                  <BrowseIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[1.15rem] font-semibold leading-6 tracking-[-0.025em] sm:text-[1.22rem]">
                        {volume.label}
                      </div>
                    </div>
                    <div className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-foreground/42 transition-transform duration-200 group-hover:translate-x-0.5">
                      <ChevronIcon />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs font-medium uppercase tracking-[0.14em] text-foreground/46">
                <span>{volume.shortLabel}</span>
                <span>Open</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
