"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ShareRow = {
  id: string;
  user_id: string;
  volume: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  translation: string | null;
  note: string | null;
  content: string | null;
  created_at: string;
  reaction_count: number;
  comment_count: number;
};

export default function Feed() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("v_scripture_shares_with_counts")
        .select("*")
        .order("reaction_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (ignore) return;
      if (error) {
        setError(error.message);
      } else {
        setRows((data as any) ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-3xl">Loading feed…</div>;
  }
  if (error) {
    return <div className="mx-auto max-w-3xl text-red-600">{error}</div>;
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

function ShareCard({ row }: { row: ShareRow }) {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const [body, setBody] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("scripture_comments")
      .select("id, body, created_at")
      .eq("share_id", shareId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) setError(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  async function addComment() {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Please sign in to comment.");
      const text = body.trim();
      if (!text) return;
      const { error } = await supabase
        .from("scripture_comments")
        .insert({ share_id: shareId, body: text });
      if (error) throw error;
      setBody("");
      load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
  }

  return (
    <div className="border-t border-black/5 dark:border-white/10 pt-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Add a comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          onClick={addComment}
          className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
        >
          Comment
        </button>
      </div>
      {loading ? (
        <div className="text-xs text-foreground/60">Loading comments…</div>
      ) : error ? (
        <div className="text-xs text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-foreground/60">No comments yet.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((c) => (
            <li key={c.id} className="text-sm text-foreground/85">
              {c.body}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedActions({ shareId }: { shareId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { count, error } = await supabase
        .from("scripture_reactions")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId);
      if (!ignore) {
        if (error) setError(error.message);
        setCount(count ?? 0);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [shareId]);

  async function toggleLike() {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Please sign in to react.");
      const { error } = await supabase.rpc("toggle_reaction", {
        p_share_id: shareId,
        p_reaction: "like",
      });
      if (error) throw error;
      const { count } = await supabase
        .from("scripture_reactions")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId);
      setCount(count ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
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
        ❤ Like {count !== null ? `(${count})` : ""}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}


