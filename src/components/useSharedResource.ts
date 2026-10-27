"use client";

import { useCallback, useEffect, useState } from "react";
import type { SharedRequests } from "@/lib/sharedRequests";

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

/**
 * The shared request for `key` (null: nothing to load). A new key shows loading, never the previous key's
 * result; leaving a key releases its request, which is aborted once no one else wants it.
 */
export function useSharedResource<T>(requests: SharedRequests<T>, key: string | null): [ResourceState<T>, () => void] {
  const [result, setResult] = useState<{ key: string; state: ResourceState<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cached = key ? requests.peek(key) : undefined;
  const hasCached = cached !== undefined;

  useEffect(() => {
    if (!key || hasCached) return;
    let active = true;
    const request = requests.request(key);
    request.promise.then(
      (data) => {
        if (active) setResult({ key, state: { status: "ready", data } });
      },
      () => {
        if (active) setResult({ key, state: { status: "error" } });
      }
    );
    return () => {
      active = false;
      request.release();
    };
  }, [requests, key, hasCached, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);

  if (!key) return [{ status: "idle" }, retry];
  if (hasCached) return [{ status: "ready", data: cached }, retry];
  if (result?.key === key) return [result.state, retry];
  return [{ status: "loading" }, retry];
}
