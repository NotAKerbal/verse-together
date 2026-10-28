import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { includeInDesktop, prepare } from "./prepare.mjs";

test("excludes environment files and private keys without excluding normal assets", () => {
  for (const name of [".env", ".env.local", ".env.production", "secret.pem", "private.key"]) {
    assert.equal(includeInDesktop(`/app/${name}`), false);
  }
  assert.equal(includeInDesktop("/app/server.js"), true);
  assert.equal(includeInDesktop("/app/public/scripture-data/pearl.json"), true);
});

test("assembles a local server, static assets, content and runtime without traced secrets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "verse-desktop-"));
  try {
    for (const dir of [".next/standalone/node_modules/example", ".next/static", "public", "content/cfm"]) {
      await mkdir(path.join(root, dir), { recursive: true });
    }
    for (const file of [".next/standalone/server.js", ".next/standalone/.env.local",
      ".next/standalone/node_modules/example/.env", ".next/static/app.css", "public/icon.png", "content/cfm/lesson.json"]) {
      await writeFile(path.join(root, file), file);
    }
    await prepare(root);
    const output = path.join(root, ".desktop/server");
    assert.equal(await readFile(path.join(output, "server.js"), "utf8"), ".next/standalone/server.js");
    assert.equal(await readFile(path.join(output, ".next/static/app.css"), "utf8"), ".next/static/app.css");
    assert.equal(await readFile(path.join(output, "content/cfm/lesson.json"), "utf8"), "content/cfm/lesson.json");
    assert.match(await readFile(path.join(output, "public/desktop-ready.txt"), "utf8"), /verse-together-desktop-ready-v1/);
    assert.ok(!(await readdir(output)).includes(".env.local"));
    assert.ok(!(await readdir(path.join(output, "node_modules/example"))).includes(".env"));
    assert.ok((await readdir(path.join(root, ".desktop/runtime"))).some(name => name.startsWith("node")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
