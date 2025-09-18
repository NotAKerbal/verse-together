import type { Metadata } from "next";
import { fetchTalkHtml, parseTalkHtml } from "@/lib/talks";
import TalkView from "@/components/TalkView";

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
  return <TalkView talk={talk} />;
}


