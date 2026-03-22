"use client";

type StorageKind = "local" | "session";

function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

export function readStorageValue(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorageValue(kind: StorageKind, key: string, value: string): boolean {
  try {
    const storage = getStorage(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageValue(kind: StorageKind, key: string): boolean {
  try {
    const storage = getStorage(kind);
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStorageJson<T>(kind: StorageKind, key: string): T | null {
  const raw = readStorageValue(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStorageJson(kind: StorageKind, key: string, value: unknown): boolean {
  try {
    return writeStorageValue(kind, key, JSON.stringify(value));
  } catch {
    return false;
  }
}
