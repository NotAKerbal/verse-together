import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";

const root = import.meta.dirname;

export default defineConfig({
  root,
  optimizeDeps: { entries: ["qa/annotations/index.html"] },
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: [
      { find: "convex/react", replacement: path.join(root, "qa/annotations/convex.tsx") },
      // A synthetic signed-in reader, so the editor saves through the fixture mutations (never device storage).
      { find: "@/lib/auth", replacement: path.join(root, "qa/annotations/auth.ts") },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  server: {
    host: "127.0.0.1", port: 4191, strictPort: true,
    watch: { ignored: ["**/.next/**"] },
  },
});
