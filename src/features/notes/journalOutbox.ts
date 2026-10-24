// Pending note text, kept in memory for one signed-in user and saved one request at a time per note.
// Nothing here touches localStorage: private text never leaves the tab except through the save mutation.
//
// Every save names the revision its text was based on. When the server refuses because the note moved on,
// the entry stops in "conflict" with the local text intact and waits for the person to choose.

export type OutboxStatus = "pending" | "saving" | "saved" | "error" | "conflict";

export type OutboxEntry = {
  noteId: string;
  /** The latest text typed for this note, exactly as typed. */
  text: string;
  /** The server revision `text` is being saved against. */
  baseRevision: number;
  /** Text the server confirmed at `baseRevision`, or null before the first confirmed save. */
  savedText: string | null;
  status: OutboxStatus;
  error: string | null;
  /** The server's revision when a save conflicted. */
  conflictRevision: number | null;
  savedAt: number | null;
};

export type SaveResult = { markdownRevision: number };

export class RevisionConflictError extends Error {
  constructor(readonly currentRevision: number | null) {
    super("This note changed somewhere else since it was opened.");
  }
}

type SaveFn = (noteId: string, markdownBody: string, expectedRevision: number) => Promise<SaveResult>;

const DEBOUNCE_MS = 900;

export class JournalOutbox {
  private entries = new Map<string, OutboxEntry>();
  private snapshot: ReadonlyMap<string, OutboxEntry> = new Map();
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlight = new Set<string>();
  private disposed = false;

  constructor(private save: SaveFn) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  get(noteId: string): OutboxEntry | undefined {
    return this.entries.get(noteId);
  }

  /** True while any note has text the server has not confirmed. */
  hasUnsaved(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.status !== "saved") return true;
    }
    return false;
  }

  /** Records typed text. `revision` is the server revision the editor loaded, used for a note's first edit. */
  edit(noteId: string, text: string, revision: number) {
    const current = this.entries.get(noteId);
    const base: OutboxEntry = current ?? {
      noteId,
      text,
      baseRevision: revision,
      savedText: null,
      status: "pending",
      error: null,
      conflictRevision: null,
      savedAt: null,
    };
    if (current && current.text === text) return;
    let status: OutboxStatus = base.status;
    if (status !== "conflict" && !this.inFlight.has(noteId)) {
      status = base.savedText !== null && text === base.savedText ? "saved" : "pending";
    }
    this.put({ ...base, text, status, error: status === "pending" ? null : base.error });
    if (status === "pending") this.schedule(noteId);
  }

  /** Saves now instead of waiting for the pause in typing. Safe to call repeatedly. */
  flush(noteId: string) {
    this.clearTimer(noteId);
    void this.run(noteId);
  }

  flushAll() {
    for (const noteId of this.entries.keys()) this.flush(noteId);
  }

  retry(noteId: string) {
    const entry = this.entries.get(noteId);
    if (!entry || entry.status !== "error") return;
    this.put({ ...entry, status: "pending", error: null });
    this.flush(noteId);
  }

  /** After a conflict: save the local text over the newer server version, by explicit choice only. */
  keepMine(noteId: string) {
    const entry = this.entries.get(noteId);
    if (!entry || entry.status !== "conflict" || entry.conflictRevision === null) return;
    this.put({
      ...entry,
      baseRevision: entry.conflictRevision,
      savedText: null,
      status: "pending",
      error: null,
      conflictRevision: null,
    });
    this.flush(noteId);
  }

  /** Forgets local text for a note (after a conflict "load latest", or once the server copy is newer and clean). */
  discard(noteId: string) {
    if (this.inFlight.has(noteId)) return;
    this.clearTimer(noteId);
    if (!this.entries.delete(noteId)) return;
    this.emit();
  }

  /** Stops timers; any text still unsaved is lost with the tab, which is why the page warns before unload. */
  dispose() {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
  }

  private schedule(noteId: string) {
    this.clearTimer(noteId);
    this.timers.set(
      noteId,
      setTimeout(() => {
        this.timers.delete(noteId);
        void this.run(noteId);
      }, DEBOUNCE_MS)
    );
  }

  private clearTimer(noteId: string) {
    const timer = this.timers.get(noteId);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(noteId);
  }

  private async run(noteId: string) {
    if (this.disposed || this.inFlight.has(noteId)) return;
    const entry = this.entries.get(noteId);
    if (!entry || entry.status !== "pending") return;
    if (entry.savedText !== null && entry.text === entry.savedText) {
      this.put({ ...entry, status: "saved" });
      return;
    }

    const sentText = entry.text;
    const sentRevision = entry.baseRevision;
    this.inFlight.add(noteId);
    this.put({ ...entry, status: "saving", error: null });
    try {
      const result = await this.save(noteId, sentText, sentRevision);
      if (this.disposed) return;
      const latest = this.entries.get(noteId) ?? entry;
      const clean = latest.text === sentText;
      this.put({
        ...latest,
        baseRevision: result.markdownRevision,
        savedText: sentText,
        status: clean ? "saved" : "pending",
        error: null,
        savedAt: Date.now(),
      });
      this.inFlight.delete(noteId);
      // Typing continued during the request: save the newer text against the new revision.
      if (!clean) this.schedule(noteId);
    } catch (error) {
      this.inFlight.delete(noteId);
      if (this.disposed) return;
      const latest = this.entries.get(noteId) ?? entry;
      if (error instanceof RevisionConflictError) {
        this.put({ ...latest, status: "conflict", error: error.message, conflictRevision: error.currentRevision });
      } else {
        const message = error instanceof Error && error.message ? error.message : "The note could not be saved.";
        this.put({ ...latest, status: "error", error: message });
      }
    }
  }

  private put(entry: OutboxEntry) {
    this.entries.set(entry.noteId, entry);
    this.emit();
  }

  private emit() {
    this.snapshot = new Map(this.entries);
    for (const listener of this.listeners) listener();
  }
}
