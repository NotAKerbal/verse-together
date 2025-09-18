import type { Metadata } from "next";

async function fetchTalkHtml(id: string): Promise<string> {
  const url = `https://scriptures.byu.edu/content/talks_ajax/${encodeURIComponent(id)}/`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Talk load failed ${res.status}`);
  return await res.text();
}

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
  return (
    <article className="prose dark:prose-invert max-w-3xl mx-auto p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}


