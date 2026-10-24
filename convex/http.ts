import { httpRouter } from "convex/server";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { authComponent, createAuth } from "./auth";
import { readProxySecret, withVerifiedClientIp } from "./authProxy";

const http = httpRouter();

let missingSecretLogged = false;

// Better Auth reads the caller IP (for rate limits and session records) only from the header the
// Next.js proxy signs, so verify that signature before Better Auth sees the request.
function createAuthForHttp(ctx: GenericCtx<DataModel>) {
  const auth = createAuth(ctx);
  return {
    ...auth,
    handler: async (request: Request) => {
      const secret = readProxySecret();
      if (!secret && !missingSecretLogged) {
        missingSecretLogged = true;
        console.error(
          "AUTH_PROXY_SECRET is not set (or is shorter than 32 characters): auth requests carry no trusted client IP, so every caller shares one rate-limit bucket per path."
        );
      }
      return auth.handler(await withVerifiedClientIp(request, secret));
    },
  };
}

authComponent.registerRoutes(http, createAuthForHttp);

export default http;
