import Link from "next/link";

export default function HelpPage() {
  return (
    <section className="page-shell py-4 sm:py-8">
      <header className="page-hero space-y-3">
        <div className="page-eyebrow">Guide</div>
        <h1 className="page-title">Help</h1>
        <p className="page-subtitle text-sm">
          Use this guide to understand notes, folders, tags, sharing, and export.
        </p>
      </header>

      <div className="panel-card rounded-[1.35rem] p-4 space-y-3">
        <h2 className="text-base font-semibold">Core flow</h2>
        <ol className="list-decimal pl-5 text-sm text-[color:var(--foreground-muted)] space-y-1">
          <li>Open scriptures in Browse and tap verses to reveal actions.</li>
          <li>Choose New Note or Add to Note.</li>
          <li>Open Notes to organize with folders and tags.</li>
          <li>Export one note or bulk export all notes.</li>
        </ol>
      </div>

      <div className="panel-card rounded-[1.35rem] p-4 space-y-3">
        <h2 className="text-base font-semibold">Folders and drag/drop</h2>
        <ul className="text-sm text-[color:var(--foreground-muted)] space-y-1">
          <li>Create folders from the + button in Notes.</li>
          <li>Drag a note card and drop it on a folder row.</li>
          <li>Drop onto Unfiled to remove folder assignment.</li>
          <li>Click a folder to expand/collapse its notes.</li>
        </ul>
      </div>

      <div className="panel-card rounded-[1.35rem] p-4 space-y-3">
        <h2 className="text-base font-semibold">Exports and sharing</h2>
        <ul className="text-sm text-[color:var(--foreground-muted)] space-y-1">
          <li>Use Export on a note for a single markdown file.</li>
          <li>Use Export all notes to download one markdown file containing every note.</li>
          <li>Use Shared on a note to open its share view link.</li>
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/notes" className="surface-button rounded-full border px-4 py-2 text-sm">
          Open Notes
        </Link>
        <Link href="/browse" className="surface-button rounded-full border px-4 py-2 text-sm">
          Browse Scriptures
        </Link>
      </div>
    </section>
  );
}
