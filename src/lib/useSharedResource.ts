"use client";

import { useCallback, useEffect, useState } from "react";
import type { SharedRequests } from "@/lib/sharedRequests";

export type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

export type ResourceStateWithMessage<T> = Exclude<ResourceState<T>, { status: "error" }> | { status: "error"; message: string };

export function useSharedResource<T>(requests: SharedRequests<T>, key: string | null): [ResourceState<T>, () => void];
export function useSharedResource<T>(requests: SharedRequests<T>, key: string | null, formatError: (error: unknown) => string): [ResourceStateWithMessage<T>, () => void];
export function useSharedResource<T>(
  requests: SharedRequests<T>,
  key: string | null,
  formatError?: (error: unknown) => string
): [ResourceState<T> | ResourceStateWithMessage<T>, () => void] {
  const [result, setResult] = useState<{ key: string; state: ResourceState<T> | ResourceStateWithMessage<T> } | null>(null);
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
      (error: unknown) => {
        if (active) setResult({ key, state: formatError ? { status: "error", message: formatError(error) } : { status: "error" } });
      }
    );
    return () => {
      active = false;
      request.release();
    };
  }, [requests, key, hasCached, attempt, formatError]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, []);

  if (!key) return [{ status: "idle" }, retry];
  if (hasCached) return [{ status: "ready", data: cached }, retry];
  if (result?.key === key) return [result.state, retry];
  return [{ status: "loading" }, retry];
}
