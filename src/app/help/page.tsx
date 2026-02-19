import Link from "next/link";

export default function HelpPage() {
  return (
    <section className="mx-auto max-w-4xl py-8 sm:py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Help</h1>
        <p className="text-sm text-foreground/70">
          Use this guide to understand notes, folders, tags, sharing, and export.
        </p>
      </header>

      <div className="rounded-lg border surface-card p-4 space-y-3">
        <h2 className="text-base font-semibold">Core flow</h2>
        <ol className="list-decimal pl-5 text-sm text-foreground/80 space-y-1">
          <li>Open scriptures in Browse and tap verses to reveal actions.</li>
          <li>Choose New Note or Add to Note.</li>
          <li>Open Notes to organize with folders and tags.</li>
          <li>Export one note or bulk export all notes.</li>
        </ol>
      </div>

      <div className="rounded-lg border surface-card p-4 space-y-3">
        <h2 className="text-base font-semibold">Folders and drag/drop</h2>
        <ul className="text-sm text-foreground/80 space-y-1">
          <li>Create folders from the + button in Notes.</li>
          <li>Drag a note card and drop it on a folder row.</li>
          <li>Drop onto Unfiled to remove folder assignment.</li>
          <li>Click a folder to expand/collapse its notes.</li>
        </ul>
      </div>

      <div className="rounded-lg border surface-card p-4 space-y-3">
        <h2 className="text-base font-semibold">Exports and sharing</h2>
        <ul className="text-sm text-foreground/80 space-y-1">
          <li>Use Export on a note for a single markdown file.</li>
          <li>Use Export all notes to download one markdown file containing every note.</li>
          <li>Use Shared on a note to open its share view link.</li>
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/feed" className="rounded-md border surface-button px-3 py-2 text-sm">
          Open Notes
        </Link>
        <Link href="/browse" className="rounded-md border surface-button px-3 py-2 text-sm">
          Browse Scriptures
        </Link>
      </div>
    </section>
  );
}
