import { fetchChapter } from "../../../../../lib/openscripture";
import Link from "next/link";
import ShareComposer from "../../../../../components/ShareComposer";
import Breadcrumbs from "@/components/Breadcrumbs";
import ChapterReader from "@/components/ChapterReader";

type Params = { params: { volume: string; book: string; chapter: string } };

export default async function ChapterPage({ params }: Params) {
  const { volume, book, chapter } = params;
  const data = await fetchChapter(volume, book, chapter);

  const currentChapter = Number(chapter);
  const prevHref = currentChapter > 1 ? `/browse/${volume}/${book}/${currentChapter - 1}` : undefined;
  const nextHref = `/browse/${volume}/${book}/${currentChapter + 1}`;

  return (
    <article className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Browse", href: "/browse" },
          { label: volume.replace(/-/g, " "), href: `/browse/${volume}` },
          { label: book.replace(/-/g, " "), href: `/browse/${volume}/${book}` },
          { label: `Chapter ${chapter}` },
        ]}
      />

      <ChapterReader
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
        prevHref={prevHref}
        nextHref={nextHref}
      />

      <ShareComposer
        volume={volume}
        book={book}
        chapter={Number(chapter)}
        verses={data.verses}
        reference={data.reference}
      />
    </article>
  );
}


