import { defineConfig } from "vitest/config";

// One config for every Vitest suite: the Notes journal tests and the Convex auth/ownership tests
// (convex-test runs functions against an in-memory backend).
export default defineConfig({
  // Inline (empty) PostCSS so CSS modules imported by components load without the app's Next-style PostCSS config.
  css: { postcss: {} },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test", "@convex-dev/better-auth"] } },
  },
});
