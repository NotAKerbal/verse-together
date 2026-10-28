import test from "node:test";
import assert from "node:assert/strict";
import { readDesktopChapter } from "./desktop.ts";

test("SSR and ordinary browsers do not call native code", async () => {
  assert.equal(await readDesktopChapter("pearl", "moses", 1), null);
  globalThis.window = {};
  try { assert.equal(await readDesktopChapter("pearl", "moses", 1), null); }
  finally { delete globalThis.window; }
});

test("desktop reads the existing chapter shape through the read-only Rust command", async () => {
  const chapter = { reference: "Moses 1", verses: [{ verse: 1, text: "Bundled text" }] };
  globalThis.window = { __TAURI__: { core: { invoke: async (command, args) => {
    assert.equal(command, "read_scripture_chapter");
    assert.deepEqual(args, { volume: "pearl", book: "moses", chapter: 1 });
    return chapter;
  } } } };
  try { assert.equal(await readDesktopChapter("pearl", "moses", 1), chapter); }
  finally { delete globalThis.window; }
});

test("native failures reach the chapter loader's fallback", async () => {
  globalThis.window = { __TAURI__: { core: { invoke: async () => { throw new Error("IPC unavailable"); } } } };
  try { await assert.rejects(readDesktopChapter("pearl", "moses", 1), /IPC unavailable/); }
  finally { delete globalThis.window; }
});
