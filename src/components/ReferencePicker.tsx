"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const volumes = [
  { id: "bookofmormon", label: "Book of Mormon" },
  { id: "oldtestament", label: "Old Testament" },
  { id: "newtestament", label: "New Testament" },
  { id: "doctrineandcovenants", label: "Doctrine & Covenants" },
  { id: "pearl", label: "Pearl of Great Price" },
];

const booksByVolume: Record<string, Array<{ id: string; label: string }>> = {
  bookofmormon: [
    { id: "1nephi", label: "1 Nephi" },
    { id: "2nephi", label: "2 Nephi" },
    { id: "alma", label: "Alma" },
  ],
  oldtestament: [
    { id: "genesis", label: "Genesis" },
    { id: "exodus", label: "Exodus" },
  ],
  newtestament: [
    { id: "matthew", label: "Matthew" },
    { id: "john", label: "John" },
  ],
  doctrineandcovenants: [
    { id: "doctrineandcovenants", label: "Sections" },
  ],
  pearl: [
    { id: "moses", label: "Moses" },
  ],
};

export default function ReferencePicker() {
  const router = useRouter();
  const [volume, setVolume] = useState(volumes[0].id);
  const [book, setBook] = useState(booksByVolume[volumes[0].id][0].id);
  const [chapter, setChapter] = useState(1);

  const books = booksByVolume[volume] ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/browse/${volume}/${book}/${chapter}`);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-foreground/70">Volume</span>
        <select
          value={volume}
          onChange={(e) => {
            const nextVolume = e.target.value;
            setVolume(nextVolume);
            const nextBook = (booksByVolume[nextVolume] ?? [])[0]?.id ?? "";
            setBook(nextBook);
          }}
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
        >
          {volumes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm">
        <span className="mb-1 text-foreground/70">Book</span>
        <select
          value={book}
          onChange={(e) => setBook(e.target.value)}
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm w-24">
        <span className="mb-1 text-foreground/70">Chapter</span>
        <input
          type="number"
          min={1}
          value={chapter}
          onChange={(e) => setChapter(Number(e.target.value))}
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
        />
      </label>

      <button
        type="submit"
        className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Go
      </button>
    </form>
  );
}


