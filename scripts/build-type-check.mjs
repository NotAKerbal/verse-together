import { createRequire } from "node:module";
import path from "node:path";

export const nextDiscardsDiagnostics = /[\\/]__(?:tests|mocks)__[\\/]|(?<=[\\/.])(?:spec|test)\.[^\\/]+$/;

const ts = createRequire(import.meta.url)("typescript");

export function typeScriptInputs(configPath) {
  const unrecoverable = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(path.resolve(configPath), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => unrecoverable.push(diagnostic),
  });
  const errors = [...unrecoverable, ...(parsed?.errors ?? [])].filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (!parsed || errors.length > 0) {
    const messages = errors.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
    throw new Error(`could not read ${path.basename(configPath)}: ${messages.join("; ") || "unknown error"}`);
  }
  return [...new Set(parsed.fileNames.map(file => path.resolve(file)))].sort();
}

export function filesOnlyTheFullCheckReports(directory) {
  const build = new Set(typeScriptInputs(path.join(directory, "tsconfig.build.json")));
  return typeScriptInputs(path.join(directory, "tsconfig.json"))
    .filter(file => !build.has(file) && !nextDiscardsDiagnostics.test(file))
    .map(file => path.relative(directory, file));
}

export function checkBuildTypeCheckInputs(directory) {
  const missed = filesOnlyTheFullCheckReports(directory);
  if (missed.length > 0) {
    throw new Error(`vercel-build refused: tsconfig.build.json skips files whose type errors Next.js would report. Rename them, or their directories, so they don't look like test files:\n${missed.join("\n")}`);
  }
}
