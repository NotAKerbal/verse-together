"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "vt_feed_migrated_notice_dismissed_v1";

export default function MigrationNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY);
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mx-auto max-w-3xl rounded-md border border-black/10 dark:border-white/15 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 p-4 flex items-start gap-3">
      <div className="text-xl">📣</div>
      <div className="flex-1 text-sm">
        <strong>New:</strong> The old feed has been replaced with a full <span className="font-semibold">Notes</span> workspace. You can now organize notes with tags, folders, and export options at <Link href="/feed" className="underline">/feed</Link>.
      </div>
      <button onClick={dismiss} className="text-sm px-2 py-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10">Dismiss</button>
    </div>
  );
}

