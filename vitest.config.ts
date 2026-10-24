import { defineConfig } from "vitest/config";
// Inline (empty) PostCSS so CSS modules imported by components load without the app's Next-style PostCSS config.
export default defineConfig({ css: { postcss: {} }, test: { include: ["tests/**/*.test.ts"], environment: "edge-runtime" } });
