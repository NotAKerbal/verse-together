// @ts-nocheck
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/lib/auth";

type Props = {
  lessonId: string;
  open: boolean;
  onClose: () => void;
};

export default function LessonBrowserPanel({ lessonId, open, onClose }: Props) {
  const { user } = useAuth();
  const lessonsApi = (api as any).lessons;
  const lesson = useQuery(lessonsApi.getLessonEditor, open && user ? ({ lessonId: lessonId as any }) : "skip") as
    | {
        id: string;
        title: string;
        cards: Array<{
          id: string;
          order: number;
          type: "notes" | "question" | "assignment";
          title: string | null;
          body: string | null;
          notes_visibility: "teacher_only" | "shared_readonly" | null;
        }>;
      }
    | undefined;

  const addCard = useMutation(lessonsApi.addCard);
  const updateCard = useMutation(lessonsApi.updateCard);
  const deleteCard = useMutation(lessonsApi.deleteCard);
  const [adding, setAdding] = useState(false);

  const orderedCards = useMemo(() => {
    if (!lesson?.cards) return [];
    return [...lesson.cards].sort((a, b) => a.order - b.order);
  }, [lesson?.cards]);

  if (!open) return null;

  async function addTextCard() {
    setAdding(true);
    try {
      await addCard({
        lessonId: lessonId as any,
        type: "notes",
        title: "Lesson note",
        body: "",
        noteComponentType: "text",
        notesVisibility: "teacher_only",
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <aside className="hidden lg:flex fixed right-0 top-[68px] bottom-0 w-[360px] xl:w-[420px] 2xl:w-[480px] z-40 border-l border-black/10 dark:border-white/15 surface-card-strong backdrop-blur flex-col">
      <header className="p-3 border-b border-black/10 dark:border-white/15 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-foreground/65">Lesson Panel</div>
          <h2 className="text-sm font-semibold truncate">{lesson?.title ?? "Loading lesson..."}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/lessons/${lessonId}`} className="rounded-md border surface-button px-2 py-1 text-xs">
            Full editor
          </Link>
          <button onClick={onClose} className="rounded-md border surface-button px-2 py-1 text-xs">
            Close
          </button>
        </div>
      </header>

      <div className="p-3 border-b border-black/10 dark:border-white/15">
        <button onClick={() => void addTextCard()} disabled={adding} className="rounded-md border surface-button px-3 py-1.5 text-xs">
          {adding ? "Adding..." : "New lesson note"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!user ? <p className="text-xs text-foreground/70">Sign in to load lesson cards.</p> : null}
        {lesson === undefined ? <p className="text-xs text-foreground/70">Loading cards...</p> : null}
        {lesson && orderedCards.length === 0 ? <p className="text-xs text-foreground/70">No cards yet.</p> : null}
        {orderedCards.map((card) => (
          <article key={card.id} className="rounded-md border surface-card p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium">
                #{card.order + 1} {card.type}
              </div>
              <button
                onClick={() => void deleteCard({ cardId: card.id as any })}
                className="rounded border border-red-300/60 px-2 py-1 text-xs text-red-600"
              >
                Delete
              </button>
            </div>

            <input
              defaultValue={card.title ?? ""}
              onBlur={(e) => void updateCard({ cardId: card.id as any, title: e.target.value })}
              placeholder="Card title"
              className="w-full rounded border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-sm"
            />

            {card.type === "notes" ? (
              <>
                <textarea
                  defaultValue={card.body ?? ""}
                  onBlur={(e) => void updateCard({ cardId: card.id as any, body: e.target.value })}
                  rows={4}
                  placeholder="Note content"
                  className="w-full rounded border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-sm"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => void updateCard({ cardId: card.id as any, notesVisibility: "teacher_only" })}
                    className={`rounded border px-2 py-1 text-xs ${
                      (card.notes_visibility ?? "teacher_only") === "teacher_only" ? "bg-foreground text-background" : "surface-button"
                    }`}
                  >
                    Teacher
                  </button>
                  <button
                    onClick={() => void updateCard({ cardId: card.id as any, notesVisibility: "shared_readonly" })}
                    className={`rounded border px-2 py-1 text-xs ${
                      card.notes_visibility === "shared_readonly" ? "bg-foreground text-background" : "surface-button"
                    }`}
                  >
                    Shared
                  </button>
                </div>
              </>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}
