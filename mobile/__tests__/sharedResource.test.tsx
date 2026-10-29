import { act, renderHook } from "@testing-library/react-native";
import { createSharedRequests } from "@/lib/sharedRequests";
import { useSharedResource as useWebResource } from "@/components/useSharedResource";
import { useSharedResource as useMobileResource } from "../src/features/explore/useSharedResource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe.each([
  ["web", useWebResource<string>, { status: "error" }],
  ["mobile", useMobileResource<string>, { status: "error", message: "No connection" }],
] as const)("%s shared resource", (_name, useResource, expectedError) => {
  it("drops old answers and releases requests when the key changes or closes", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const signals = new Map<string, AbortSignal>();
    const requests = createSharedRequests<string>((key, signal) => {
      signals.set(key, signal);
      return key === "first" ? first.promise : second.promise;
    });
    const { result, rerender } = await renderHook(({ resourceKey }: { resourceKey: string | null }) => useResource(requests, resourceKey), {
      initialProps: { resourceKey: "first" },
    });
    expect(result.current[0]).toEqual({ status: "loading" });
    await rerender({ resourceKey: "second" });
    expect(signals.get("first")?.aborted).toBe(true);
    await act(async () => first.resolve("Old answer"));
    expect(result.current[0]).toEqual({ status: "loading" });
    await rerender({ resourceKey: null });
    expect(signals.get("second")?.aborted).toBe(true);
    await act(async () => second.resolve("Closed answer"));
    expect(result.current[0]).toEqual({ status: "idle" });
  });

  it("retries failures and reuses successful cached answers", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = jest.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const requests = createSharedRequests<string>(load);
    const { result, rerender } = await renderHook(({ resourceKey }: { resourceKey: string | null }) => useResource(requests, resourceKey), {
      initialProps: { resourceKey: "faith" },
    });
    await act(async () => first.reject(new Error("No connection")));
    expect(result.current[0]).toEqual(expectedError);
    await act(async () => result.current[1]());
    expect(result.current[0]).toEqual({ status: "loading" });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve("Faith"));
    expect(result.current[0]).toEqual({ status: "ready", data: "Faith" });
    await rerender({ resourceKey: null });
    await rerender({ resourceKey: "faith" });
    expect(result.current[0]).toEqual({ status: "ready", data: "Faith" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a shared request alive until its last subscriber leaves", async () => {
    const pending = deferred<string>();
    let signal!: AbortSignal;
    const load = jest.fn((_key: string, requestSignal: AbortSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    const requests = createSharedRequests(load);
    const first = await renderHook(() => useResource(requests, "faith"));
    const second = await renderHook(() => useResource(requests, "faith"));
    expect(load).toHaveBeenCalledTimes(1);
    await first.unmount();
    expect(signal.aborted).toBe(false);
    await second.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new Error("Cancelled")));
  });
});
