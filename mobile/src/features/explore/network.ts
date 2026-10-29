// Network reads for Explore and translations: a time limit, cancellation when the reader moves on, and errors that
// say what went wrong in plain words. Nothing is cached or invented when a request fails.

export class NetworkError extends Error {
  constructor(message: string, readonly kind: "offline" | "timeout" | "http" | "format" | "aborted", readonly status?: number) {
    super(message);
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 12000, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new NetworkError("It took too long to answer. Try again.", "timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** What a refused or failed answer means for the reader, when the service didn't say. */
function statusMessage(status: number): string {
  if (status === 401 || status === 403) return `Verse Together declined the request (${status}). Try again later.`;
  if (status === 404) return "Verse Together has nothing at that address (404).";
  if (status === 429) return "Too many lookups at once. Wait a moment and try again.";
  if (status >= 500) return `Verse Together couldn't answer right now (${status}). Try again.`;
  return `The service answered ${status}.`;
}

const aborted = () => new NetworkError("The request was cancelled.", "aborted");

/** JSON from `url`, failing on a timeout, no connection, an HTTP error, or a body that isn't JSON. `signal` cancels it. */
export async function getJson<T>(url: string, ms = 12000, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw aborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);
  try {
    let response: Response;
    try {
      response = await withTimeout(fetch(url, { headers: { accept: "application/json" }, signal: controller.signal }), ms, cancel);
    } catch (error) {
      if (signal?.aborted) throw aborted();
      if (error instanceof NetworkError) throw error;
      throw new NetworkError("Couldn't connect. Check your internet connection and try again.", "offline");
    }
    let body: unknown = null;
    let parsed = true;
    try {
      body = await withTimeout(response.json() as Promise<unknown>, ms, cancel);
    } catch (error) {
      if (signal?.aborted) throw aborted();
      if (error instanceof NetworkError && error.kind === "timeout") throw error;
      parsed = false;
    }
    // Some transports finish JSON parsing even after abort. Never publish or cache that late answer.
    if (signal?.aborted) throw aborted();
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : statusMessage(response.status);
      throw new NetworkError(message, "http", response.status);
    }
    if (!parsed) throw new NetworkError(`The service answered with something unexpected (${response.status}).`, "format", response.status);
    return body as T;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
