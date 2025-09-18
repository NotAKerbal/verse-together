import ReferencePicker from "../../../../components/ReferencePicker";
import Link from "next/link";
import Breadcrumbs from "@/components/Breadcrumbs";

export default function BookLanding({ params }: { params: { volume: string; book: string } }) {
  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Browse", href: "/browse" },
          { label: params.volume.replace(/-/g, " "), href: `/browse/${params.volume}` },
          { label: params.book.replace(/-/g, " ") },
        ]}
      />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold capitalize">{params.book.replace(/-/g, " ")}</h1>
        <p className="text-foreground/80">Pick a chapter or use the reference picker.</p>
      </header>
      <div>
        <ReferencePicker />
      </div>
      <ChapterSelector volume={params.volume} book={params.book} />
    </section>
  );
}


function ChapterSelector({ volume, book }: { volume: string; book: string }) {
  // Basic chapter options per book; can be expanded with real data later
  const defaultCount = 50;
  const chapters = Array.from({ length: defaultCount }, (_, i) => i + 1);
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-medium">Select a chapter</h2>
      <ul className="flex flex-wrap gap-2">
        {chapters.map((n) => (
          <li key={n}>
            <Link
              href={`/browse/${volume}/${book}/${n}`}
              className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              {n}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

