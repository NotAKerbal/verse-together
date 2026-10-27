import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// One config for every Vitest suite: the Notes journal tests and the Convex auth/ownership tests
// (convex-test runs functions against an in-memory backend).
export default defineConfig({
  // Inline (empty) PostCSS so CSS modules imported by components load without the app's Next-style PostCSS config.
  css: { postcss: {} },
  // The app's "@/" import alias (tsconfig paths), so components load with their own imports.
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }] },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test", "@convex-dev/better-auth"] } },
  },
});
