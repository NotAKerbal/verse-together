import { cp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export function includeInDesktop(source) {
  const name = path.basename(source);
  // Next standalone can trace .env files. A distributed app must never ship deployment secrets.
  return !/^\.env(?:\.|$)/i.test(name) && !/\.(?:pem|key)$/i.test(name);
}

export async function prepare(root) {
  const output = path.join(root, ".desktop");
  const standalone = path.join(root, ".next/standalone");
  await readFile(path.join(standalone, "server.js")); // Fail before replacing the last successful package.
  await rm(output, { recursive: true, force: true });
  const server = path.join(output, "server");
  const options = { recursive: true, filter: includeInDesktop };
  await cp(standalone, server, options);
  await cp(path.join(root, ".next/static"), path.join(server, ".next/static"), options);
  await cp(path.join(root, "public"), path.join(server, "public"), options);
  await cp(path.join(root, "content"), path.join(server, "content"), options);
  await writeFile(path.join(server, "public/desktop-ready.txt"), "verse-together-desktop-ready-v1\n");
  const runtime = path.join(output, "runtime");
  await mkdir(runtime, { recursive: true });
  const node = path.join(runtime, process.platform === "win32" ? "node.exe" : "node");
  await cp(process.execPath, node);
  await chmod(node, 0o755);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  // Build with the actual host runtime. Do not run a shell or rely on a global Next binary.
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--turbopack"], {
    cwd: root, stdio: "inherit", env: { ...process.env, VERSE_DESKTOP_BUILD: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  await prepare(root);
  console.log("Desktop server and host Node runtime prepared in .desktop/");
}
