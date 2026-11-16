import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { watchUnreleasedNotes, writeUnreleasedNotes } from "./scripts/unreleased-notes.mjs";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/resources": ["./content/cfm/**/*"],
  },
};

export default function config(phase: string): NextConfig {
  writeUnreleasedNotes();
  if (phase === PHASE_DEVELOPMENT_SERVER) watchUnreleasedNotes();
  return nextConfig;
}
