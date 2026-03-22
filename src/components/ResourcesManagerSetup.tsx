"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResourcesManagerSetup() {
  const router = useRouter();
  const [volume, setVolume] = useState("book-of-mormon");
  const [book, setBook] = useState("1-nephi");
  const [chapter, setChapter] = useState("1");
  const [verses, setVerses] = useState("1-5");

  function openManager() {
    const next = `/resources/manage?volume=${encodeURIComponent(volume.trim().toLowerCase())}&book=${encodeURIComponent(book.trim().toLowerCase())}&chapter=${encodeURIComponent(chapter.trim())}&verses=${encodeURIComponent(verses.trim())}`;
    router.push(next);
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 p-3 space-y-2">
      <h2 className="text-sm font-semibold">Choose passage to manage</h2>
      <p className="text-xs text-foreground/65">Enter the passage context. Then the full manager will load for that scripture range.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="Volume slug (e.g. book-of-mormon)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
        <input value={book} onChange={(e) => setBook(e.target.value)} placeholder="Book slug (e.g. 1-nephi)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
        <input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Chapter" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
        <input value={verses} onChange={(e) => setVerses(e.target.value)} placeholder="Verses (e.g. 1-5)" className="rounded-md border border-black/10 dark:border-white/15 px-2 py-1.5 text-sm bg-transparent" />
      </div>
      <button onClick={openManager} className="rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm">
        Open manager
      </button>
    </div>
  );
}
