import type { Metadata } from "next";
import { fetchTalkHtml, parseTalkHtml } from "@/lib/talks";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = params.id;
  try {
    const html = await fetchTalkHtml(id);
    const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = match ? match[1].replace(/<[^>]*>/g, " ").trim() : `Talk ${id}`;
    return { title };
  } catch {
    return { title: `Talk ${id}` };
  }
}

export default async function TalkPage({ params }: Params) {
  const id = params.id;
  const html = await fetchTalkHtml(id);
  const talk = parseTalkHtml(id, html);
  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="mb-6">
        <p className="text-xs text-foreground/60">{talk.session}</p>
        <h1 className="text-2xl font-bold leading-tight mt-1">{talk.title}</h1>
        {talk.speaker ? (
          <p className="text-sm text-foreground/80 mt-2">By {talk.speaker}{talk.calling ? <span className="text-foreground/60"> — {talk.calling}</span> : null}</p>
        ) : null}
      </header>
      {talk.aboutHtml ? (
        <section className="bg-black/5 dark:bg-white/5 rounded-lg p-4 mb-6">
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: talk.aboutHtml }} />
        </section>
      ) : null}
      <article className="prose dark:prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: talk.bodyHtml }} />
      </article>
    </div>
  );
}


