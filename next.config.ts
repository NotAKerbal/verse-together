import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve server components and API routes in the desktop package.
  ...(process.env.VERSE_DESKTOP_BUILD === "1" ? { output: "standalone" as const, outputFileTracingRoot: process.cwd() } : {}),
  outputFileTracingIncludes: {
    "/api/resources": ["./content/cfm/**/*"],
  },
};

export default nextConfig;
