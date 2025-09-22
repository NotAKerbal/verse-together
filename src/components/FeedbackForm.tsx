"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FeedbackState = {
  message: string;
  contact: string;
};

export default function FeedbackForm() {
  const [form, setForm] = useState<FeedbackState>({ message: "", contact: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname;
  }, []);

  useEffect(() => {
    if (success) {
      const id = setTimeout(() => setSuccess(false), 4000);
      return () => clearTimeout(id);
    }
  }, [success]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const message = form.message.trim();
    const contact = form.contact.trim();
    if (message.length < 5) {
      setError("Please write at least 5 characters.");
      return;
    }
    if (message.length > 2000) {
      setError("Please keep feedback under 2000 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: dbError } = await supabase
        .from("feedback")
        .insert({ message, contact: contact || null, path });
      if (dbError) {
        const friendly = /permission|policy/i.test(dbError.message)
          ? "Please sign in to send feedback."
          : dbError.message;
        throw new Error(friendly);
      }
      setSuccess(true);
      setForm({ message: "", contact: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 p-5">
      <h2 className="text-xl font-semibold">Have feedback or ideas?</h2>
      <p className="mt-1 text-sm text-foreground/80">
        Share suggestions, feature requests, or improvements. I read every submission.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium">Your feedback</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className="mt-1 w-full min-h-[96px] rounded-md border border-black/10 dark:border-white/15 bg-transparent p-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            placeholder="What would make Verse Together better?"
            maxLength={2000}
            required
          />
          <div className="mt-1 text-xs text-foreground/60">{form.message.length}/2000</div>
        </div>
        <div>
          <label className="block text-sm font-medium">Contact (optional)</label>
          <input
            type="text"
            value={form.contact}
            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            className="mt-1 w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent p-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            placeholder="Email, X/Twitter, or leave blank"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}
        {success && (
          <div className="text-sm text-green-700 dark:text-green-400">Thanks! Your feedback was sent.</div>
        )}
        <div className="pt-1">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={submitting}
            data-ripple
          >
            {submitting ? "Sending..." : "Send feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}


