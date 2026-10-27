// In-browser requests shared by key: callers asking for the same key (the reader's desktop and mobile Explore
// panels, or a card shown again) share one in-flight request and, once it succeeds, its value. A request is
// aborted when every caller has released it before it settles; failures are never kept, so a later request
// retries. Pure apart from the loader it is given, so the rules are testable.

export type SharedRequest<T> = { promise: Promise<T>; release: () => void };

export type SharedRequests<T> = {
  /** A value already loaded for this key (never waits). */
  peek(key: string): T | undefined;
  /** Join the in-flight request for this key, or start one. Call `release` when the result is no longer wanted. */
  request(key: string): SharedRequest<T>;
};

export function createSharedRequests<T>(
  load: (key: string, signal: AbortSignal) => Promise<T>,
  { maxEntries = 60 }: { maxEntries?: number } = {}
): SharedRequests<T> {
  const values = new Map<string, T>();
  const inFlight = new Map<string, { promise: Promise<T>; controller: AbortController; users: number }>();

  return {
    peek(key) {
      return values.get(key);
    },
    request(key) {
      const value = values.get(key);
      if (value !== undefined) return { promise: Promise.resolve(value), release: () => {} };
      let entry = inFlight.get(key);
      if (!entry) {
        const controller = new AbortController();
        const promise = load(key, controller.signal).then((loaded) => {
          values.delete(key);
          values.set(key, loaded);
          while (values.size > maxEntries) values.delete(values.keys().next().value as string);
          return loaded;
        });
        const created = { promise, controller, users: 0 };
        const forget = () => {
          if (inFlight.get(key) === created) inFlight.delete(key);
        };
        promise.then(forget, forget);
        inFlight.set(key, created);
        entry = created;
      }
      const joined = entry;
      joined.users += 1;
      let released = false;
      return {
        promise: joined.promise,
        release() {
          if (released) return;
          released = true;
          joined.users -= 1;
          if (joined.users === 0 && inFlight.get(key) === joined) {
            inFlight.delete(key);
            joined.controller.abort();
          }
        },
      };
    },
  };
}

/** Fetches JSON, failing on an HTTP error or a body without `ok: true`. */
export async function fetchOkJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = (await response.json().catch(() => null)) as ({ ok?: boolean } & T) | null;
  if (!response.ok || !body?.ok) throw new Error(`Request failed (${response.status})`);
  return body;
}
