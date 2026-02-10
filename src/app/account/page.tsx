"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  deleteComment as deleteCommentMutation,
  getAccountData,
  lookupUserByEmail,
  removeFriendship,
  sendFriendRequest as sendFriendRequestMutation,
  updateComment,
  updateFriendshipStatus,
} from "@/lib/appData";
// import Link from "next/link";

type Friend = { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked" };
type CommentRow = { id: string; body: string; created_at: string; share_id: string; visibility: "public" | "friends" };
type ShareRow = {
  id: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  translation: string | null;
  content: string | null;
};

export default function AccountPage() {
  const { user, getToken } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myComments, setMyComments] = useState<CommentRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, ShareRow>>({});
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const token = await getToken({ template: "convex" });
        if (!token) return;
        const data = await getAccountData(token);
        if (!alive) return;
        setFriends(data.friends as Friend[]);
        setMyComments(data.myComments as CommentRow[]);
        setNames(data.names);
        setShares(data.shares as Record<string, ShareRow>);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Failed to load";
        setError(msg);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.id, getToken]);

  // const friendsList = useMemo(() => {
  //   if (!user?.id) return [] as Array<{ friendUserId: string; status: Friend["status"] }>;
  //   return friends.map((f) => ({
  //     friendUserId: f.requester_id === user.id ? f.addressee_id : f.requester_id,
  //     status: f.status,
  //   }));
  // }, [friends, user?.id]);

  const incoming = useMemo(() => (
    user?.id ? friends.filter((f) => f.status === "pending" && f.addressee_id === user.id) : []
  ), [friends, user?.id]);
  const outgoing = useMemo(() => (
    user?.id ? friends.filter((f) => f.status === "pending" && f.requester_id === user.id) : []
  ), [friends, user?.id]);
  const accepted = useMemo(() => friends.filter((f) => f.status === "accepted"), [friends]);

  function referenceFromShare(s: ShareRow | undefined) {
    if (!s) return "";
    const base = `${s.book} ${s.chapter}:${s.verse_start}${s.verse_end && s.verse_end !== s.verse_start ? "-" + s.verse_end : ""}`;
    return s.translation ? `${base} (${s.translation})` : base;
  }

  async function saveEdit(id: string) {
    try {
      const text = editingBody.trim();
      if (!text) return;
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Please sign in.");
      await updateComment(token, id, text);
      setEditingId(null);
      setEditingBody("");
      const latest = await getAccountData(token);
      setMyComments(latest.myComments as CommentRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update";
      setCommentError(msg);
    }
  }

  async function deleteComment(id: string) {
    try {
      const sure = confirm("Delete this comment?");
      if (!sure) return;
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Please sign in.");
      await deleteCommentMutation(token, id);
      setMyComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete";
      setCommentError(msg);
    }
  }

  async function sendFriendRequest() {
    setError(null);
    try {
      const email = emailToAdd.trim();
      if (!email) return;
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Please sign in.");
      const targetId = await lookupUserByEmail(email);
      if (!targetId) {
        setError("No user with that email");
        return;
      }
      if (targetId === user!.id) {
        setError("You cannot add yourself");
        return;
      }
      await sendFriendRequestMutation(token, targetId);
      setEmailToAdd("");
      const latest = await getAccountData(token);
      setFriends(latest.friends as Friend[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send request";
      setError(msg);
    }
  }

  async function accept(friendshipId: string) {
    setError(null);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Please sign in.");
      await updateFriendshipStatus(token, friendshipId, "accepted");
      const latest = await getAccountData(token);
      setFriends(latest.friends as Friend[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept request");
    }
  }

  async function remove(friendshipId: string) {
    setError(null);
    try {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Please sign in.");
      await removeFriendship(token, friendshipId);
      setFriends((prev) => prev.filter((f) => f.id !== friendshipId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove friendship");
    }
  }

  async function decline(friendshipId: string) {
    await remove(friendshipId);
  }

  async function cancelRequest(friendshipId: string) {
    await remove(friendshipId);
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-foreground/80">Please sign in to view your account.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Friends</h2>
        <div className="flex items-center gap-2">
          <input
            type="email"
            placeholder="Friend&apos;s email"
            value={emailToAdd}
            onChange={(e) => setEmailToAdd(e.target.value)}
            className="flex-1 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
          <button onClick={sendFriendRequest} className="rounded-md border border-black/10 dark:border-white/15 px-3 py-2 text-sm">Add</button>
        </div>
        {loading ? (
          <div className="text-sm text-foreground/60">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Friend requests</h3>
              {incoming.length === 0 && outgoing.length === 0 ? (
                <div className="text-sm text-foreground/70">No pending requests.</div>
              ) : (
                <>
                  {incoming.length > 0 ? (
                    <ul className="space-y-2">
                      {incoming.map((f) => {
                        const otherId = f.requester_id;
                        return (
                          <li key={f.id} className="rounded-md border border-black/10 dark:border-white/15 p-3 flex items-center justify-between">
                            <div className="text-sm">
                              <span className="font-medium">{names[otherId] ?? `User ${otherId.slice(0, 6)}`}</span>
                              <span className="ml-2 text-foreground/70">Incoming</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => accept(f.id)} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Accept</button>
                              <button onClick={() => decline(f.id)} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Decline</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {outgoing.length > 0 ? (
                    <ul className="space-y-2">
                      {outgoing.map((f) => {
                        const otherId = f.addressee_id;
                        return (
                          <li key={f.id} className="rounded-md border border-black/10 dark:border-white/15 p-3 flex items-center justify-between">
                            <div className="text-sm">
                              <span className="font-medium">{names[otherId] ?? `User ${otherId.slice(0, 6)}`}</span>
                              <span className="ml-2 text-foreground/70">Outgoing</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => cancelRequest(f.id)} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Cancel</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Your friends</h3>
              {accepted.length === 0 ? (
                <div className="text-sm text-foreground/70">No friends yet.</div>
              ) : (
                <ul className="space-y-2">
                  {accepted.map((f) => {
                    const isRequester = f.requester_id === user.id;
                    const otherId = isRequester ? f.addressee_id : f.requester_id;
                    return (
                      <li key={f.id} className="rounded-md border border-black/10 dark:border-white/15 p-3 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">{names[otherId] ?? `User ${otherId.slice(0, 6)}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => remove(f.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 dark:border-red-400/40">Remove</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent comments</h2>
        {myComments.length === 0 ? (
          <div className="text-sm text-foreground/70">You haven&apos;t commented yet.</div>
        ) : (
          <ul className="space-y-2">
            {myComments.map((c) => (
              <li key={c.id} className="rounded-md border border-black/10 dark:border-white/15 p-3 text-sm">
                {(() => {
                  const s = shares[c.share_id];
                  const ref = referenceFromShare(s);
                  return ref ? (
                    <header className="mb-2">
                      <div className="font-medium">{ref}</div>
                      {s?.content ? (
                        <blockquote className="text-foreground/85 whitespace-pre-wrap">{s.content}</blockquote>
                      ) : null}
                    </header>
                  ) : null;
                })()}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-foreground/70">{new Date(c.created_at).toLocaleString()} {c.visibility === "friends" ? (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded border border-black/10 dark:border-white/15 text-[10px] uppercase tracking-wide">Friends</span>
                  ) : null}</span>
                  <div className="flex items-center gap-2">
                    {editingId === c.id ? (
                      <>
                        <button onClick={() => saveEdit(c.id)} className="text-xs px-2 py-1 rounded bg-foreground text-background">Save</button>
                        <button onClick={() => { setEditingId(null); setEditingBody(""); }} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(c.id); setEditingBody(c.body); }} className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15">Edit</button>
                        <button onClick={() => deleteComment(c.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 dark:border-red-400/40">Delete</button>
                      </>
                    )}
                  </div>
                </div>
                {editingId === c.id ? (
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                  />
                ) : (
                  <div className="text-foreground/85 whitespace-pre-wrap">{c.body}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        {commentError ? <div className="text-xs text-red-600">{commentError}</div> : null}
      </section>
    </div>
  );
}


