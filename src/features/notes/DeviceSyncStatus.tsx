"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexSignedIn } from "./useConvexSignedIn";
import { annotationImport, deviceStudy, guideHighlightImport } from "./deviceStudy";
import { useDeviceStudy } from "./useDeviceStudy";

const SyncContext = createContext<{ syncing: boolean; error: string | null; retry: () => void } | null>(null);

/** Mounted once. Claimed records remain on disk until their atomic, idempotent import is acknowledged. */
export function DeviceSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useConvexSignedIn();
  const { loaded } = useDeviceStudy();
  const importNote = useMutation(api.insights.importDeviceNote);
  const importAnnotation = useMutation(api.annotations.upsertVerseAnnotation);
  const importHighlight = useMutation(api.annotations.saveGuideHighlight);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ownerId = user?.id;
  const ownerRef = useRef(ownerId);
  useEffect(() => {
    ownerRef.current = ownerId;
  }, [ownerId]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!ready || !ownerId || !loaded) return;
    const owner = ownerId;
    let cancelled = false;
    async function sync() {
      setSyncing(true);
      setError(null);
      try {
        deviceStudy.claim(owner);
        const data = deviceStudy.getSnapshot();
        for (const note of data.notes.filter((row) => row.owner === owner)) {
          if (cancelled || ownerRef.current !== owner) return;
          await importNote({
            deviceId: note.id,
            expectedOwner: owner,
            markdownBody: note.markdown_body ?? "",
            journalDate: note.journal_date!,
            source: note.source ?? undefined,
            createdAt: Date.parse(note.created_at),
            updatedAt: Date.parse(note.updated_at),
            readingAt: note.reading_at ? Date.parse(note.reading_at) : undefined,
          });
          deviceStudy.acknowledge("notes", note.id, owner);
        }
        for (const row of data.annotations.filter((row) => row.owner === owner)) {
          if (cancelled || ownerRef.current !== owner) return;
          await importAnnotation(annotationImport(row, owner));
          deviceStudy.acknowledge("annotations", row.id, owner);
        }
        for (const row of data.highlights.filter((row) => row.owner === owner)) {
          if (cancelled || ownerRef.current !== owner) return;
          await importHighlight(guideHighlightImport(row, owner));
          deviceStudy.acknowledge("highlights", row.id, owner);
        }
      } catch {
        if (!cancelled) setError("Some study is still saved on this device and hasn't synced yet.");
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, [ready, ownerId, loaded, attempt, importNote, importAnnotation, importHighlight]);
  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);
  return <SyncContext.Provider value={{ syncing, error, retry }}>{children}</SyncContext.Provider>;
}

export default function DeviceSyncStatus() {
  const { user } = useConvexSignedIn();
  const device = useDeviceStudy();
  const sync = useContext(SyncContext);
  const message = device.error ?? (user ? sync?.error ?? (sync?.syncing ? "Syncing device study…" : null) : null);
  if (!message) return null;
  return (
    <div
      className="text-xs text-[color:var(--foreground-muted)]"
      role={device.error || sync?.error ? "alert" : "status"}
    >
      {message}
      {user && sync?.error ? (
        <button type="button" onClick={sync.retry} className="ml-2 underline">
          Try sync again
        </button>
      ) : null}
    </div>
  );
}
