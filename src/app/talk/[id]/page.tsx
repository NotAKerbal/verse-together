import type { Metadata } from "next";
import { fetchTalkDetails } from "@/lib/talks";
import TalkView from "@/components/TalkView";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  try {
    const talk = await fetchTalkDetails(id);
    return { title: talk.title || `Talk ${id}` };
  } catch {
    return { title: `Talk ${id}` };
  }
}

export default async function TalkPage({ params }: Params) {
  const { id } = await params;
  const talk = await fetchTalkDetails(id);
  return <TalkView talk={talk} />;
}


