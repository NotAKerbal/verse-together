import { describe, expect, test } from "vitest";
import { createSharedRequests } from "../src/lib/sharedRequests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("requests shared between Explore panels", () => {
  test("shares one in-flight request per key and keeps its value", async () => {
    const pending = deferred<string>();
    const keys: string[] = [];
    const requests = createSharedRequests<string>((key) => {
      keys.push(key);
      return pending.promise;
    });
    const desktop = requests.request("bd/faith");
    const mobile = requests.request("bd/faith");
    expect(keys).toEqual(["bd/faith"]);
    pending.resolve("Faith");
    expect(await desktop.promise).toBe("Faith");
    expect(await mobile.promise).toBe("Faith");
    expect(requests.peek("bd/faith")).toBe("Faith");
    await requests.request("bd/faith").promise;
    expect(keys).toEqual(["bd/faith"]);
  });

  test("aborts a request only when every caller has left it", () => {
    const signals: AbortSignal[] = [];
    const requests = createSharedRequests<string>((_key, signal) => {
      signals.push(signal);
      return new Promise<string>(() => {});
    });
    const first = requests.request("tg/faith");
    const second = requests.request("tg/faith");
    first.release();
    first.release();
    expect(signals[0].aborted).toBe(false);
    second.release();
    expect(signals[0].aborted).toBe(true);
    // A new selection of the same entry starts afresh.
    requests.request("tg/faith");
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);
  });

  test("forgets failures so the next request retries", async () => {
    let calls = 0;
    const requests = createSharedRequests<string>(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return "Faith";
    });
    await expect(requests.request("gs/faith").promise).rejects.toThrow("offline");
    expect(requests.peek("gs/faith")).toBeUndefined();
    expect(await requests.request("gs/faith").promise).toBe("Faith");
    expect(calls).toBe(2);
  });

  test("keeps a bounded number of values", async () => {
    const requests = createSharedRequests<string>(async (key) => key, { maxEntries: 2 });
    for (const key of ["a", "b", "c"]) await requests.request(key).promise;
    expect(requests.peek("a")).toBeUndefined();
    expect(requests.peek("c")).toBe("c");
  });
});
