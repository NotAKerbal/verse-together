"use client";

import dynamic from "next/dynamic";

// CodeMirror only runs in the browser and is a sizeable bundle, so it loads on demand.
const LazyMarkdownEditor = dynamic(() => import("./MarkdownEditor"), {
  ssr: false,
  loading: () => (
    <p role="status" className="py-6 text-sm text-[color:var(--foreground-muted)]">
      Loading the editor…
    </p>
  ),
});

export default LazyMarkdownEditor;
