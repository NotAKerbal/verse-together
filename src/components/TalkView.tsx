"use client";

import { useMemo, useState } from "react";

export type TalkDetails = {
  id: string;
  title: string;
  speaker?: string;
  calling?: string;
  session?: string;
  aboutHtml?: string;
  bodyHtml: string;
};

type Props = {
  talk: TalkDetails;
};

export default function TalkView({ talk }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);

  const { preNotesHtml, noteItems } = useMemo(() => {
    const headerRe = /<h[12][^>]*>\s*Notes\s*<\/h[12]>/i;
    const olRe = /<ol[^>]*class=\"?footnotes\"?[^>]*>([\s\S]*?)<\/ol>/i;
    const headerIdx = talk.bodyHtml.search(headerRe);
    const olIdx = talk.bodyHtml.search(olRe);

    // Determine start of notes region as earliest of header or ol
    const notesStart = [headerIdx, olIdx].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? -1;
    if (notesStart >= 0) {
      const before = talk.bodyHtml.slice(0, notesStart);
      const after = talk.bodyHtml.slice(notesStart);
      const olMatch = after.match(olRe);
      const items = olMatch ? Array.from(olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) => m[1]) : [];
      return { preNotesHtml: before, noteItems: items };
    }
    return { preNotesHtml: talk.bodyHtml, noteItems: [] };
  }, [talk.bodyHtml]);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="mb-6">
        <p className="text-xs text-foreground/60">{talk.session}</p>
        <h1 className="text-2xl font-bold leading-tight mt-1">{talk.title}</h1>
        {talk.speaker ? (
          <p className="text-sm text-foreground/80 mt-2">
            By {talk.speaker}
            {talk.calling ? <span className="text-foreground/60"> — {talk.calling}</span> : null}
          </p>
        ) : null}
      </header>

      {talk.aboutHtml ? (
        <section className="bg-black/5 dark:bg-white/5 rounded-lg p-4 mb-6">
          <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: talk.aboutHtml }} />
        </section>
      ) : null}

      <article className="prose dark:prose-invert prose-p:my-3 max-w-none">
        <div dangerouslySetInnerHTML={{ __html: preNotesHtml }} />
      </article>

      {noteItems.length > 0 ? (
        <section className="mt-6">
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
            aria-expanded={notesOpen}
            aria-controls="talk-notes"
          >
            {notesOpen ? "Hide notes" : "Show notes"}
          </button>
          {notesOpen ? (
            <ul id="talk-notes" className="mt-3 flex flex-col gap-3">
              {noteItems.map((item, i) => (
                <li key={i} className="border border-black/10 dark:border-white/15 rounded-lg p-4 bg-black/5 dark:bg-white/5">
                  <div className="text-xs text-foreground/60 mb-1">Note {i + 1}</div>
                  <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: item }} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}


