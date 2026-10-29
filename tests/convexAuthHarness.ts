/// <reference types="vite/client" />
// Shared convex-test setup for suites outside tests/convex: a real Better Auth component, live sessions,
// and app users linked to a stable owner key, so tests go through the same identity checks as production
// (convex/utils.ts) instead of trusting a bare JWT subject.
import { convexTest } from "convex-test";
import betterAuthTest from "./convex/betterAuth";
import schema from "../convex/schema";
import { components } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");

export function newBackend() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

export type Backend = ReturnType<typeof newBackend>;

/** A new live Better Auth session for an existing Better Auth user; returns the session id. */
export async function newSession(t: Backend, authUserId: string) {
  const now = Date.now();
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: { token: `token-${authUserId}-${Math.random()}`, userId: authUserId, expiresAt: now + 60 * 60 * 1000, createdAt: now, updatedAt: now },
    },
  });
  return String(session._id);
}

/**
 * A caller holding a validly signed Convex JWT for a live Better Auth session, linked (as the admin
 * migration links legacy accounts) to the app user that owns rows keyed by `ownerKey`. With
 * `linked: false` there is no app user yet (as before users:ensureCurrentUser), so it owns nothing.
 */
export async function signInAs(t: Backend, ownerKey: string, displayName = ownerKey, { linked = true } = {}) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: { name: displayName, email: `${ownerKey}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
    },
  });
  const authUserId = String(user._id);
  const sessionId = await newSession(t, authUserId);
  if (linked) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: ownerKey,
        authUserId,
        authLinkedAt: now,
        authLinkSource: "admin-migration",
        displayName,
        createdAt: now,
        updatedAt: now,
      })
    );
  }
  return {
    authUserId,
    sessionId,
    as: t.withIdentity({ subject: authUserId, sessionId }),
    /** Sign-out: deletes the session while the caller's (still unexpired) JWT stays in use. */
    revoke: () =>
      t.mutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "session", where: [{ field: "_id", value: sessionId }] },
      }),
  };
}
