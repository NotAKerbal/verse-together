import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

// Convex trusts only JWTs issued by this deployment's Better Auth component (issuer CONVEX_SITE_URL,
// audience "convex"). Clerk-issued tokens are no longer accepted.
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
