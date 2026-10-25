import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// Talks to /api/auth on this origin, which proxies to the Better Auth routes on the Convex deployment.
export const authClient = createAuthClient({
  plugins: [convexClient()],
});
