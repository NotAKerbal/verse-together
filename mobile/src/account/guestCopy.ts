// Copying this device's study (journal entries, verse notes and marks, guide notes and marks) to a signed-in
// account, only when its owner asks. The account import functions are the web's (DeviceSyncStatus.tsx): each device
// record is imported once per account, keyed by its device id, so a retry after a dropped connection never adds a
// second copy.
//
// Unlike the web, which moves signed-out study into the account, the app keeps it: its screens still read this
// device's study, so a copy leaves everything here as it was. A ledger beside the study records which account each
// record went to. Records are reserved for an account before anything is sent (as the web's claim does), so an
// interrupted copy can only ever finish into that same account: another account signed in later is never offered
// them, and nothing from one account is sent to another. Nothing on the device is deleted or changed.

import { annotationImport, guideHighlightImport, type DeviceStudy } from "../shared/web";
import type { StoragePort } from "../storage/kv";

export const ACCOUNT_COPIES_KEY = "vt_device_study_account_copies_v1";

type Kind = "notes" | "annotations" | "highlights";
type LedgerEntry = { owner: string; copied: boolean };
export type CopyLedger = { version: 1; records: Record<string, LedgerEntry> };

const EMPTY_LEDGER: CopyLedger = { version: 1, records: {} };

function key(kind: Kind, id: string) {
  return `${kind}:${id}`;
}

export function readLedger(storage: StoragePort): CopyLedger {
  const raw = storage.getItem(ACCOUNT_COPIES_KEY);
  if (!raw) return EMPTY_LEDGER;
  const value = JSON.parse(raw) as Partial<CopyLedger>;
  if (value?.version !== 1 || !value.records || typeof value.records !== "object") throw new Error("This device's copy record couldn't be read.");
  return value as CopyLedger;
}

function writeLedger(storage: StoragePort, ledger: CopyLedger) {
  storage.setItem(ACCOUNT_COPIES_KEY, JSON.stringify(ledger));
}

type DeviceRecord = { kind: Kind; id: string };

/** This device's own study records (the native store never assigns owners: every record is the device's). */
function deviceRecords(study: DeviceStudy): DeviceRecord[] {
  return [
    ...study.notes.filter((row) => row.owner === null).map((row) => ({ kind: "notes" as const, id: row.id })),
    ...study.annotations.filter((row) => row.owner === null).map((row) => ({ kind: "annotations" as const, id: row.id })),
    ...study.highlights.filter((row) => row.owner === null).map((row) => ({ kind: "highlights" as const, id: row.id })),
  ];
}

export type CopySummary = {
  /** Not yet in this account: new, or reserved for it by a copy that didn't finish. */
  toCopy: number;
  copied: number;
  /** Copied (or being copied) to a different account; never offered to this one. */
  elsewhere: number;
};

export function copySummary(study: DeviceStudy, ledger: CopyLedger, owner: string): CopySummary {
  const summary: CopySummary = { toCopy: 0, copied: 0, elsewhere: 0 };
  for (const record of deviceRecords(study)) {
    const entry = ledger.records[key(record.kind, record.id)];
    if (!entry) summary.toCopy += 1;
    else if (entry.owner !== owner) summary.elsewhere += 1;
    else if (entry.copied) summary.copied += 1;
    else summary.toCopy += 1;
  }
  return summary;
}

export type CopyImports = {
  importNote: (args: {
    deviceId: string;
    expectedOwner: string;
    markdownBody: string;
    journalDate: string;
    source?: NonNullable<DeviceStudy["notes"][number]["source"]>;
    createdAt: number;
    updatedAt: number;
    readingAt?: number;
  }) => Promise<unknown>;
  importAnnotation: (args: ReturnType<typeof annotationImport>) => Promise<unknown>;
  importHighlight: (args: ReturnType<typeof guideHighlightImport>) => Promise<unknown>;
};

export class AccountChangedError extends Error {
  constructor() {
    super("The signed-in account changed, so the copy stopped. Nothing was sent to the other account.");
  }
}

export type CopyResult = { copied: number; remaining: number; error: string | null };

/**
 * Copies the device's not-yet-copied records to `owner`. `currentOwner` is checked before every record (and the
 * server checks `expectedOwner` again), so a sign-out or account switch partway stops the copy. Safe to call again.
 */
export async function copyDeviceStudy(options: {
  owner: string;
  storage: StoragePort;
  study: DeviceStudy;
  currentOwner: () => string | null;
  imports: CopyImports;
  offlineMessage: string;
}): Promise<CopyResult> {
  const { owner, storage, study, currentOwner, imports } = options;
  if (currentOwner() !== owner) throw new AccountChangedError();
  const ledger: CopyLedger = { version: 1, records: { ...readLedger(storage).records } };
  // Reserve first, and only what isn't already another account's.
  let reserved = false;
  for (const record of deviceRecords(study)) {
    const id = key(record.kind, record.id);
    if (!ledger.records[id]) {
      ledger.records[id] = { owner, copied: false };
      reserved = true;
    }
  }
  if (reserved) writeLedger(storage, ledger);

  const pending = deviceRecords(study).filter((record) => {
    const entry = ledger.records[key(record.kind, record.id)];
    return entry?.owner === owner && !entry.copied;
  });
  let copied = 0;
  for (const record of pending) {
    if (currentOwner() !== owner) return { copied, remaining: pending.length - copied, error: new AccountChangedError().message };
    try {
      if (record.kind === "notes") {
        const note = study.notes.find((row) => row.id === record.id)!;
        await imports.importNote({
          deviceId: note.id,
          expectedOwner: owner,
          markdownBody: note.markdown_body ?? "",
          journalDate: note.journal_date!,
          source: note.source ?? undefined,
          createdAt: Date.parse(note.created_at),
          updatedAt: Date.parse(note.updated_at),
          readingAt: note.reading_at ? Date.parse(note.reading_at) : undefined,
        });
      } else if (record.kind === "annotations") {
        await imports.importAnnotation(annotationImport(study.annotations.find((row) => row.id === record.id)!, owner));
      } else {
        await imports.importHighlight(guideHighlightImport(study.highlights.find((row) => row.id === record.id)!, owner));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const offline = /network|fetch|connect|offline|timed? ?out/i.test(message);
      return {
        copied,
        remaining: pending.length - copied,
        error: offline
          ? options.offlineMessage
          : "Some of this device's study couldn't be copied. What was copied is in your account; try again for the rest.",
      };
    }
    ledger.records[key(record.kind, record.id)] = { owner, copied: true };
    writeLedger(storage, ledger);
    copied += 1;
  }
  return { copied, remaining: 0, error: null };
}

/** After `owner`'s account is deleted, its copies are gone: this device's records may be copied to an account again. */
export function releaseAccountCopies(storage: StoragePort, owner: string) {
  const ledger = readLedger(storage);
  const records = Object.fromEntries(Object.entries(ledger.records).filter(([, entry]) => entry.owner !== owner));
  writeLedger(storage, { version: 1, records });
}
