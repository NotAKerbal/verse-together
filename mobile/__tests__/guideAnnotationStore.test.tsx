// The guide annotation boundary (guideAnnotationStore): signed out it is this device's unowned spans of one guide;
// with an account session it never shows device rows. Unknown owners and offline writes are refused instead of
// saving on the device. Spans still saving ("pending:" ids) are never written by id.

import { act, renderHook } from "@testing-library/react-native";
import { deleteGuideAnnotation, setGuideAnnotation, useGuideAnnotations, type GuideAnnotationTarget } from "../src/features/cfm/guideAnnotationStore";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { resetStudySession, setStudySession, type StudySession } from "../src/storage/studySession";

const GUIDE = "2026-10-26";
const anchor = (exact: string, startOffset = 0): GuideAnnotationTarget => ({
  guide: GUIDE,
  part: "introduction",
  startBlock: "",
  startOffset,
  endBlock: "",
  endOffset: startOffset + exact.length,
  exact,
  prefix: "",
  suffix: "",
});

beforeEach(() => {
  resetStudySession();
  resetAccountStores();
  setStoragePort(memoryStorage());
  initDeviceStudy();
});

afterEach(() => resetStudySession());

describe("guide annotations on this device", () => {
  it("reads only this device's unowned spans of the guide asked for", async () => {
    const { result, rerender } = await renderHook(() => useGuideAnnotations(GUIDE));
    await act(async () => {
      await setGuideAnnotation(anchor("Mine"), { highlightColor: "yellow" });
    });
    // Another guide's span, and one already claimed by an account, are not this guide's device spans.
    deviceStudy.setGuideAnnotation({ ...anchor("Other week"), guide: "2026-10-19" }, { underlineColor: "red" });
    deviceStudy.claim("account-1");
    await act(async () => {
      await setGuideAnnotation(anchor("Still mine", 20), { body: "A note" });
    });
    await rerender({});
    expect(result.current.status).toBe("ready");
    expect(result.current.rows.map((row) => [row.exact, row.highlightColor, row.body])).toEqual([["Still mine", null, "A note"]]);
  });

  it("changes only the patch's fields of a saved span, and removes a span left with nothing", async () => {
    const { result, rerender } = await renderHook(() => useGuideAnnotations(GUIDE));
    await act(async () => {
      await setGuideAnnotation(anchor("Words"), { highlightColor: "blue" });
    });
    await rerender({});
    const [saved] = result.current.rows;
    await act(async () => {
      await setGuideAnnotation({ ...anchor("Words"), highlightId: saved.id }, { underlineColor: "#336699" });
    });
    await rerender({});
    expect(result.current.rows).toMatchObject([{ id: saved.id, highlightColor: "blue", underlineColor: "#336699", body: "" }]);
    await act(async () => {
      await setGuideAnnotation({ ...anchor("Words"), highlightId: saved.id }, { highlightColor: null, underlineColor: null });
    });
    await rerender({});
    expect(result.current.rows).toEqual([]);
  });

  it("deletes a span with its note", async () => {
    const { result, rerender } = await renderHook(() => useGuideAnnotations(GUIDE));
    await act(async () => {
      await setGuideAnnotation(anchor("Noted"), { body: "Keep this", highlightColor: "green" });
    });
    await rerender({});
    await act(async () => {
      await deleteGuideAnnotation(result.current.rows[0]);
    });
    await rerender({});
    expect(result.current.rows).toEqual([]);
    expect(deviceStudy.getSnapshot().highlights).toEqual([]);
  });

  it("never writes by a span id that is still saving", async () => {
    await renderHook(() => useGuideAnnotations(GUIDE));
    await expect(setGuideAnnotation({ ...anchor("Words"), highlightId: "pending:introduction::0::5" }, { highlightColor: "red" })).rejects.toThrow();
    const pending = { ...anchor("Words"), id: "pending:introduction::0::5", highlightColor: "red" as const, underlineColor: null, body: "", updatedAt: "2026-10-28T00:00:00.000Z" };
    await expect(deleteGuideAnnotation(pending)).rejects.toThrow();
    expect(deviceStudy.getSnapshot().highlights).toEqual([]);
  });
});

describe("guide annotations with an account session", () => {
  it.each(["checking", "error", "deletion-pending", "offline"] as const)("shows none of the device's spans while %s, from the first render", async (reason) => {
    deviceStudy.setGuideAnnotation(anchor("Device words"), { highlightColor: "yellow" });
    const { result, rerender } = await renderHook(() => useGuideAnnotations(GUIDE));
    expect(result.current.rows).toHaveLength(1);
    // The session appears: the very next render masks the device's rows.
    const next: StudySession = reason === "offline"
      ? { mode: "account", owner: "ada", store: accountStore("ada"), sync: null }
      : { mode: "blocked", reason };
    await act(async () => setStudySession(next));
    await rerender({});
    expect(result.current).toEqual({ status: "unavailable", rows: [] });
  });

  it("refuses writes instead of saving them on the device, and resumes once signed out", async () => {
    const { rerender } = await renderHook(() => useGuideAnnotations(GUIDE));
    await act(async () => setStudySession({ mode: "account", owner: "ada", store: accountStore("ada"), sync: null }));
    await rerender({});
    await expect(setGuideAnnotation(anchor("Words"), { highlightColor: "yellow" })).rejects.toThrow();
    await expect(
      deleteGuideAnnotation({ ...anchor("Words"), id: "device-id", highlightColor: "yellow", underlineColor: null, body: "", updatedAt: "2026-10-28T00:00:00.000Z" })
    ).rejects.toThrow();
    expect(deviceStudy.getSnapshot().highlights).toEqual([]);

    await act(async () => resetStudySession());
    await rerender({});
    await setGuideAnnotation(anchor("Words"), { highlightColor: "yellow" });
    expect(deviceStudy.getSnapshot().highlights).toHaveLength(1);
  });
});
