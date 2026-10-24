import type { Metadata } from "next";
import Link from "next/link";
import AccountControl from "@/components/AccountControl";
import { readGuides } from "@/lib/cfm/cfmGuide";

export const metadata: Metadata = {
  title: "Come Follow Me · Verse Together",
};

// Server-rendered from content/cfm/guides.json; the file system is only read here, never on the client.
export default function ComeFollowMeIndexPage() {
  const guides = [...readGuides()].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="shell-container w-full py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] leading-tight text-[color:var(--ink)] sm:text-[2.5rem]">
              Come Follow Me
            </h1>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              Weekly study guides, read beside the scripture they cover.
            </p>
          </div>
          <AccountControl variant="page" />
        </div>

        {guides.length === 0 ? (
          <p className="mt-10 text-[color:var(--foreground-muted)]">No guides have been published yet.</p>
        ) : (
          <ol className="mt-8 border-t border-[color:var(--rule)]" aria-label="Study guides">
            {guides.map((guide) => (
              <li key={guide.slug} className="border-b border-[color:var(--rule)]">
                <Link
                  href={`/come-follow-me/${guide.startDate}`}
                  className="group block py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[color:var(--accent-rubric)]">
                    <span>{guide.scripture}</span>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={guide.startDate}>{guide.dateLabel}</time>
                  </p>
                  <h2 className="font-display mt-2 text-[1.45rem] leading-snug text-[color:var(--ink)] group-hover:underline group-hover:decoration-[color:var(--accent-rubric-line)] group-hover:underline-offset-4">
                    {guide.title}
                  </h2>
                  <p className="mt-2 font-serif text-[1.02rem] leading-relaxed text-[color:var(--foreground-muted)]">
                    {guide.summary}
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--foreground-soft)]">By {guide.author}</p>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-8 text-sm">
          <Link
            href="/plans"
            className="text-[color:var(--foreground-soft)] underline decoration-[color:var(--rule-strong)] underline-offset-4 hover:text-[color:var(--ink)]"
          >
            Existing study plans
          </Link>
        </p>
      </div>
    </div>
  );
}
