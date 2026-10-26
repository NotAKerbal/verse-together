import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/resources": ["./content/cfm/**/*"],
  },
};

export default nextConfig;
