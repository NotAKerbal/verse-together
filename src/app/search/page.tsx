import { Suspense } from "react";
import ScriptureSearchExperience from "@/components/ScriptureSearchExperience";

function SearchPageFallback() {
  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="surface-card-strong rounded-[1.75rem] border p-5 sm:p-6">
        <div className="h-[3.25rem] rounded-[1.2rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)]" />
        <div className="mt-4 h-4 w-72 max-w-full rounded bg-foreground/10" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-[1.35rem] border p-4 surface-card">
            <div className="h-3 w-24 rounded bg-foreground/10" />
            <div className="mt-3 h-5 w-40 rounded bg-foreground/12" />
            <div className="mt-4 h-3 w-full rounded bg-foreground/8" />
            <div className="mt-2 h-3 w-11/12 rounded bg-foreground/8" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <ScriptureSearchExperience />
    </Suspense>
  );
}
