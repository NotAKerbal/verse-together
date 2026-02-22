import Link from "next/link";

export default function LessonsDisabledNotice() {
  return (
    <section className="mx-auto max-w-3xl py-12 space-y-4">
      <h1 className="text-2xl sm:text-3xl font-semibold">Lessons are temporarily disabled</h1>
      <p className="text-sm text-foreground/70">
        This section is turned off for now while we make updates.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/browse" className="rounded-md border surface-button px-3 py-2 text-sm">
          Browse scriptures
        </Link>
        <Link href="/feed" className="rounded-md border surface-button px-3 py-2 text-sm">
          Open notes
        </Link>
      </div>
    </section>
  );
}
