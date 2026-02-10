"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { type FeedShare } from "@/lib/appData";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Feed() {
  const rows = useQuery(api.social.getFeed, {}) as FeedShare[] | undefined;

  if (rows === undefined) {
    return <div className="mx-auto max-w-3xl">Loading feed…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl text-foreground/80">
        No shares yet. Browse scriptures and share your first highlight!
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {rows.map((r) => (
        <div key={r.id} className="space-y-2">
          <ShareCard row={r} />
          <Comments shareId={r.id} />
        </div>
      ))}
    </div>
  );
}

function ShareCard({ row }: { row: FeedShare }) {
  const reference = useMemo(() => {
    const ref = `${row.book} ${row.chapter}:${row.verse_start}${row.verse_end && row.verse_end !== row.verse_start ? "-" + row.verse_end : ""}`;
    return row.translation ? `${ref} (${row.translation})` : ref;
  }, [row]);

  return (
    <article className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="font-medium">{reference}</h3>
        <div className="text-xs text-foreground/60">❤ {row.reaction_count} · 💬 {row.comment_count}</div>
      </header>
      {row.content ? (
        <blockquote className="text-sm text-foreground/90 whitespace-pre-wrap">{row.content}</blockquote>
      ) : null}
      {row.note ? (
        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{row.note}</p>
      ) : null}
      <FeedActions shareId={row.id} />
    </article>
  );
}

function Comments({ shareId }: { shareId: string }) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  type CommentRow = { id: string; body: string; created_at: string; user_id: string; visibility: "public" | "friends" };
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends">("public");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const comments = useQuery(api.social.getComments, { shareId: shareId as any }) as CommentRow[] | undefined;
  const createCommentMutation = useMutation(api.social.createComment);
  const updateCommentMutation = useMutation(api.social.updateComment);
  const deleteCommentMutation = useMutation(api.social.deleteComment);

  const commenterIds = useMemo(
    () => Array.from(new Set((comments ?? []).map((c) => c.user_id))),
    [comments]
  );
  const names = useQuery(
    api.users.getNames,
    comments ? { clerkIds: commenterIds } : "skip"
  ) as Record<string, string> | undefined;

  function formatWhen(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleString();
  }

  async function addComment() {
    try {
      if (!user) throw new Error("Please sign in to comment.");
      const text = body.trim();
      if (!text) return;
      await createCommentMutation({ shareId: shareId as any, body: text, visibility });
      setBody("");
      setVisibility("public");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed";
      setError(message);
    }
  }

  async function saveEdit(id: string) {
    try {
      const text = editingBody.trim();
      if (!text) return;
      await updateCommentMutation({ commentId: id as any, body: text });
      setEditingId(null);
      setEditingBody("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update";
      setError(message);
    }
  }

  async function deleteComment(id: string) {
    try {
      const sure = confirm("Delete this comment?");
      if (!sure) return;
      await deleteCommentMutation({ commentId: id as any });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete";
      setError(message);
    }
  }

  return (
    <div className="border-t border-black/5 dark:border-white/10 pt-2 space-y-2">
      {user ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add a comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm"
          />
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "friends")}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
            title="Visibility"
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
          </select>
          <button
            onClick={addComment}
            className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            Comment
          </button>
        </div>
      ) : null}
      {comments === undefined ? (
        <div className="text-xs text-foreground/60">Loading comments…</div>
      ) : error ? (
        <div className="text-xs text-red-600">{error}</div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-foreground/60">No comments yet.</div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const isMine = user?.id && c.user_id === user.id;
            const name = names?.[c.user_id];
            const who = isMine ? "You" : name ? name : `User ${c.user_id.slice(0, 6)}`;
            return (
              <li key={c.id} className="rounded-md border border-black/10 dark:border-white/15 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-foreground/70">
                    {who} · {formatWhen(c.created_at)} {c.visibility === "friends" ? <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded border border-black/10 dark:border-white/15 text-[10px] uppercase tracking-wide">Friends</span> : null}
                  </div>
                  {isMine ? (
                    editingId === c.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => saveEdit(c.id)} className="text-xs px-2 py-1 rounded bg-foreground text-background">Save</button>
                        <button onClick={() => { setEditingId(null); setEditingBody(""); }} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingId(c.id); setEditingBody(c.body); }} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Edit</button>
                        <button onClick={() => deleteComment(c.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 dark:border-red-400/40">Delete</button>
                      </div>
                    )
                  ) : null}
                </div>
                {editingId === c.id ? (
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="text-sm text-foreground/85 whitespace-pre-wrap">{c.body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FeedActions({ shareId }: { shareId: string }) {
  const { user } = useAuth();
  const count = useQuery(api.social.getReactionCount, { shareId: shareId as any }) as number | undefined;
  const toggleReactionMutation = useMutation(api.social.toggleReaction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleLike() {
    setLoading(true);
    setError(null);
    try {
      if (!user) throw new Error("Please sign in to react.");
      await toggleReactionMutation({ shareId: shareId as any, reaction: "like" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={toggleLike}
        disabled={loading}
        className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
      >
        ❤ Like {typeof count === "number" ? `(${count})` : ""}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}


