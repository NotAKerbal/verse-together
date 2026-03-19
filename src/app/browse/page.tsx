import Link from "next/link";
const commonVolumes = [
  { id: "bookofmormon", label: "Book of Mormon" },
  { id: "oldtestament", label: "Old Testament" },
  { id: "newtestament", label: "New Testament" },
  { id: "dnc", label: "Doctrine & Covenants" },
  { id: "pearl", label: "Pearl of Great Price" },
];

function BrowseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
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

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ lessonId?: string | string[] }>;
}) {
  const query = await searchParams;
  const lessonId = Array.isArray(query.lessonId) ? query.lessonId[0] : query.lessonId;
  const lessonSuffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : "";
  return (
    <section className="space-y-6">
      <ul className="mx-auto flex max-w-2xl flex-col gap-3">
        {commonVolumes.map((v) => (
          <li key={v.id}>
            <Link
              href={`/browse/${v.id}${lessonSuffix}`}
              className="flex items-center gap-4 rounded-[1.35rem] border px-4 py-4 transition-colors sm:px-5"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--surface-card-strong) 86%, white 4%), var(--surface-card))",
                borderColor: "color-mix(in oklab, var(--surface-border) 92%, transparent)",
                boxShadow: "var(--surface-shadow), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
              data-tap
            >
              <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center text-foreground/78">
                <BrowseIcon />
              </div>
              <div className="min-w-0 flex-1 text-lg font-semibold leading-tight sm:text-xl">
                {v.label}
              </div>
              <div className="text-foreground/38">
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
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
