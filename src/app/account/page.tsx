"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  getAccountData,
  lookupUserByEmail,
  removeFriendship,
  sendFriendRequest as sendFriendRequestMutation,
  updateFriendshipStatus,
} from "@/lib/appData";

type Friend = { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked" };

export default function AccountPage() {
  const { user, getToken } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

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
        setNames(data.names);
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

  const incoming = useMemo(() => (
    user?.id ? friends.filter((f) => f.status === "pending" && f.addressee_id === user.id) : []
  ), [friends, user?.id]);
  const outgoing = useMemo(() => (
    user?.id ? friends.filter((f) => f.status === "pending" && f.requester_id === user.id) : []
  ), [friends, user?.id]);
  const accepted = useMemo(() => friends.filter((f) => f.status === "accepted"), [friends]);

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
    <div className="mx-auto max-w-3xl">
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
    </div>
  );
}


