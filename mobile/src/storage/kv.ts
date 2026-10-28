// Synchronous key-value storage for study data, backed by SQLite (expo-sqlite's kv-store). The web keeps the
// same records in localStorage; this is the native equivalent, so the shared stores keep their synchronous,
// write-before-notify contract: a write either reaches the database or throws and the editor stays unsaved.

export type StoragePort = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let port: StoragePort | null = null;

function sqlitePort(): StoragePort {
  // Required lazily so tests (and anything that injects a port) never load the native module.
  const { Storage } = require("expo-sqlite/kv-store") as typeof import("expo-sqlite/kv-store");
  return {
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
    removeItem: (key) => {
      Storage.removeItemSync(key);
    },
  };
}

export function storage(): StoragePort {
  port ??= sqlitePort();
  return port;
}

/** Replace the backing store (tests use memoryStorage). */
export function setStoragePort(next: StoragePort | null) {
  port = next;
}

export function memoryStorage(initial: Record<string, string> = {}): StoragePort & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** A JSON value under a key, or `fallback` when it is missing or unreadable. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  storage().setItem(key, JSON.stringify(value));
}
