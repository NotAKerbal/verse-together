import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const script = fileURLToPath(new URL("../scripts/deploy-notes-development.mjs", import.meta.url));
const safeEnv = {
  ...process.env,
  CONVEX_DEPLOYMENT: "dev:fabulous-dogfish-606",
  NEXT_PUBLIC_CONVEX_URL: "https://fabulous-dogfish-606.convex.cloud",
  CONVEX_DEPLOY_KEY: "",
  CONVEX_SELF_HOSTED_URL: "",
  CONVEX_SELF_HOSTED_ADMIN_KEY: "",
};

for (const [key, value, reason] of [
  ["CONVEX_DEPLOYMENT", "prod:lovable-seal-140", "CONVEX_DEPLOYMENT must"],
  ["NEXT_PUBLIC_CONVEX_URL", "https://lovable-seal-140.convex.cloud", "NEXT_PUBLIC_CONVEX_URL must"],
  ["CONVEX_DEPLOY_KEY", "test-only-not-a-credential", "CONVEX_DEPLOY_KEY is set"],
  ["CONVEX_SELF_HOSTED_URL", "http://127.0.0.1:1", "self-hosted targets are not allowed"],
] as const) {
  test(`refuses ${key} before running a deployment command`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...safeEnv, [key]: value },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("deploy:notes:development refused:");
    expect(result.stderr).toContain(reason);
  });
}
