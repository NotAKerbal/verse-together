import type { NextConfig } from "next";
import { writeUnreleasedNotes } from "./scripts/unreleased-notes.mjs";

writeUnreleasedNotes();

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/resources": ["./content/cfm/**/*"],
  },
};

export default nextConfig;
