import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { describe, expect, test } from "vitest";
import schema from "../../convex/schema";
import { api, components, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

const LEGACY_ID = "user_2legacyAlice01";
const PREFS = { showFootnotes: false, fontScale: 1.1, fontFamily: "sans" as const, comparisonView: "inline" as const };

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

type T = ReturnType<typeof setup>;

async function createAuthUser(t: T, email: string, emailVerified: boolean, name = "Someone") {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: { model: "user", data: { name, email, emailVerified, createdAt: now, updatedAt: now } },
  });
  return String(user._id);
}

async function createSession(t: T, userId: string, expiresAt = Date.now() + 60 * 60 * 1000) {
  const now = Date.now();
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: { token: `token-${userId}-${now}-${Math.random()}`, userId, expiresAt, createdAt: now, updatedAt: now },
    },
  });
  return String(session._id);
}

/** A caller holding a validly signed Convex JWT for this Better Auth user and session. */
async function signedIn(t: T, email: string, emailVerified = true, name = "Someone") {
  const authUserId = await createAuthUser(t, email, emailVerified, name);
  const sessionId = await createSession(t, authUserId);
  return { authUserId, sessionId, as: t.withIdentity({ subject: authUserId, sessionId }) };
}

async function seedLegacyUser(t: T, opts: { isAdmin?: boolean; withPrefs?: boolean; email?: string } = {}) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      clerkId: LEGACY_ID,
      email: opts.email ?? "alice@example.com",
      displayName: "Alice (Clerk)",
      isAdmin: opts.isAdmin,
      createdAt: now,
      updatedAt: now,
    });
    if (opts.withPrefs !== false) {
      await ctx.db.insert("readerPreferences", { clerkId: LEGACY_ID, ...PREFS, textWidth: "wide", updatedAt: now });
    }
  });
}

const aliceEntry = { legacyClerkId: LEGACY_ID, email: "alice@example.com", emailVerified: true, name: "Alice" };

describe("identity resolution", () => {
  test("signed-out callers own nothing", async () => {
    const t = setup();
    await expect(t.mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(/Unauthorized/);
    expect(await t.query(api.users.viewer, {})).toBeNull();
    expect(await t.query(api.preferences.getReaderPreferences, {})).toBeNull();
    await expect(t.mutation(api.preferences.saveReaderPreferences, PREFS)).rejects.toThrow(/Unauthorized/);
  });

  test("a token without a live Better Auth session is rejected", async () => {
    const t = setup();
    const authUserId = await createAuthUser(t, "nosession@example.com", true);
    // Valid subject but no session id (e.g. a token for a session that never existed).
    const forged = t.withIdentity({ subject: authUserId });
    await expect(forged.mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(/Unauthorized/);
    // Expired session.
    const expiredSession = await createSession(t, authUserId, Date.now() - 1000);
    const expired = t.withIdentity({ subject: authUserId, sessionId: expiredSession });
    await expect(expired.mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(/Unauthorized/);
  });

  test("a session id belonging to another user does not authenticate the subject", async () => {
    const t = setup();
    const victim = await createAuthUser(t, "victim@example.com", true);
    const attacker = await signedIn(t, "attacker@example.com");
    // Tokens are signed, so this pairing can't be minted in practice; the resolver still refuses it.
    const mismatched = t.withIdentity({ subject: victim, sessionId: attacker.sessionId });
    await expect(mismatched.mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(/Unauthorized/);
    expect(await mismatched.query(api.users.viewer, {})).toBeNull();
  });

  test("first sign-in provisions one app user keyed by the Better Auth id", async () => {
    const t = setup();
    const { authUserId, as } = await signedIn(t, "New@Example.com", true, "New Person");
    const first = await as.mutation(api.users.ensureCurrentUser, {});
    const second = await as.mutation(api.users.ensureCurrentUser, {});
    expect(first.appUserId).toBe(authUserId);
    expect(second.appUserId).toBe(authUserId);
    expect(first.isAdmin).toBe(false);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clerkId: authUserId,
      authUserId,
      authLinkSource: "better-auth-signup",
      email: "new@example.com",
      displayName: "New Person",
    });
  });

  test("unverified emails are not stored for friend lookup", async () => {
    const t = setup();
    const { as } = await signedIn(t, "unverified@example.com", false);
    await as.mutation(api.users.ensureCurrentUser, {});
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows[0].email).toBeUndefined();
    expect(await t.query(api.users.lookupUserByEmail, { email: "unverified@example.com" })).toBeNull();
  });

  test("an unlinked sign-in never inherits a legacy account, even with the same email or client-supplied fields", async () => {
    const t = setup();
    await seedLegacyUser(t, { isAdmin: true });
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);
    // Old clients send profile fields; they must be ignored.
    await as.mutation(api.users.upsertCurrentUser, { email: "alice@example.com", displayName: "Alice" });
    const viewer = await as.query(api.users.viewer, {});
    expect(viewer?.appUserId).toBe(authUserId);
    expect(viewer?.isAdmin).toBe(false);
    expect(await as.query(api.preferences.getReaderPreferences, {})).toBeNull();
    const ensured = await as.mutation(api.users.ensureCurrentUser, {});
    expect(ensured.legacyAccountPending).toBe(true);
    const legacy = await t.run((ctx) =>
      ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", LEGACY_ID)).unique()
    );
    expect(legacy?.authUserId).toBeUndefined();
  });

  test("users cannot read or change each other's data", async () => {
    const t = setup();
    const a = await signedIn(t, "a@example.com");
    const b = await signedIn(t, "b@example.com");
    await a.as.mutation(api.users.ensureCurrentUser, {});
    await b.as.mutation(api.users.ensureCurrentUser, {});
    await a.as.mutation(api.preferences.saveReaderPreferences, { ...PREFS, fontScale: 1.2 });
    expect((await a.as.query(api.preferences.getReaderPreferences, {}))?.fontScale).toBe(1.2);
    expect(await b.as.query(api.preferences.getReaderPreferences, {})).toBeNull();
  });

  test("revoking the session cuts off access even though the JWT is still unexpired", async () => {
    const t = setup();
    const { as, sessionId } = await signedIn(t, "revoke@example.com");
    await as.mutation(api.users.ensureCurrentUser, {});
    await as.mutation(api.preferences.saveReaderPreferences, PREFS);
    await t.mutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "session", where: [{ field: "_id", value: sessionId }] },
    });
    expect(await as.query(api.preferences.getReaderPreferences, {})).toBeNull();
    await expect(as.mutation(api.preferences.saveReaderPreferences, PREFS)).rejects.toThrow(/Unauthorized/);
  });

  test("private live queries go empty instead of throwing once the session is revoked; writes still fail", async () => {
    const t = setup();
    const { as, sessionId } = await signedIn(t, "signout@example.com");
    await as.mutation(api.users.ensureCurrentUser, {});
    const { id: draftId } = await as.mutation(api.insights.createDraft, { title: "Private note" });
    await as.mutation(api.noteFolders.createFolder, { name: "Private folder" });
    expect(await as.query(api.insights.listMyDrafts, {})).toHaveLength(1);
    expect((await as.query(api.insights.getDraft, { draftId }))?.title).toBe("Private note");
    expect((await as.query(api.insights.getSharedDraft, { draftId }))?.title).toBe("Private note");
    expect((await as.query(api.noteFolders.getWorkspace, {})).folders).toHaveLength(1);

    // Another signed-in user is still refused rather than handed an empty result.
    const other = await signedIn(t, "other@example.com");
    await other.as.mutation(api.users.ensureCurrentUser, {});
    await expect(other.as.query(api.insights.getDraft, { draftId })).rejects.toThrow(/Draft not found/);
    expect(await other.as.query(api.insights.listMyDrafts, {})).toEqual([]);
    expect(await other.as.query(api.insights.getSharedDraft, { draftId })).toBeNull();

    // Sign-out deletes the session while the (still unexpired) JWT keeps re-running subscriptions.
    await t.mutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "session", where: [{ field: "_id", value: sessionId }] },
    });
    for (const caller of [as, t]) {
      expect(await caller.query(api.insights.listMyDrafts, {})).toEqual([]);
      expect(await caller.query(api.insights.getDraft, { draftId })).toBeNull();
      expect(await caller.query(api.insights.getSharedDraft, { draftId })).toBeNull();
      expect(await caller.query(api.noteFolders.getWorkspace, {})).toEqual({ folders: [], assignments: [] });
      expect(await caller.query(api.social.getAccountData, {})).toEqual({ friends: [], myComments: [], names: {}, shares: {} });
    }
    await expect(as.mutation(api.insights.createDraft, { title: "x" })).rejects.toThrow(/Unauthorized/);
    await expect(as.mutation(api.insights.renameDraft, { draftId, title: "x" })).rejects.toThrow(/Unauthorized/);
    await expect(as.mutation(api.noteFolders.createFolder, { name: "x" })).rejects.toThrow(/Unauthorized/);
    // The content itself is untouched.
    const remaining = await t.run((ctx) => ctx.db.get(draftId));
    expect(remaining?.title).toBe("Private note");
  });
});

describe("legacy account migration", () => {
  test("dry run plans without writing; apply links and preserves data and admin status", async () => {
    const t = setup();
    await seedLegacyUser(t, { isAdmin: true });
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);

    const dry = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: true, entries: [aliceEntry] });
    expect(dry.applied).toBe(false);
    expect(dry.plans[0]).toMatchObject({ status: "link", actions: ["link_existing_auth_user"], authUserId });
    expect(await as.query(api.users.viewer, {})).toBeNull();

    const applied = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(applied.applied).toBe(true);

    const viewer = await as.mutation(api.users.ensureCurrentUser, {});
    expect(viewer.appUserId).toBe(LEGACY_ID);
    expect(viewer.isAdmin).toBe(true);
    expect(viewer.legacyAccount).toBe(true);
    expect((await as.query(api.preferences.getReaderPreferences, {}))?.textWidth).toBe("wide");

    // Content still belongs to the legacy key; nothing was rewritten or duplicated.
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clerkId: LEGACY_ID, authUserId, authLinkSource: "admin-migration", isAdmin: true });

    const rerun = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(rerun.plans[0].status).toBe("already_linked");
  });

  test("refuses to hand legacy data to an unverified Better Auth account", async () => {
    const t = setup();
    await seedLegacyUser(t);
    await signedIn(t, "alice@example.com", false);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(result.applied).toBe(false);
    expect(result.plans[0]).toMatchObject({ status: "error", error: "existing_auth_user_unverified" });
  });

  test("refuses unverified Clerk emails, bad ids and unknown legacy users", async () => {
    const t = setup();
    await seedLegacyUser(t);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, {
      dryRun: true,
      createMissingAuthUsers: true,
      entries: [
        { ...aliceEntry, emailVerified: false },
        { legacyClerkId: "not-a-clerk-id", email: "x@example.com", emailVerified: true },
        { legacyClerkId: "user_2nobodyHere99", email: "nobody@example.com", emailVerified: true },
      ],
    });
    expect(result.plans.map((plan: { error?: string }) => plan.error)).toEqual([
      "legacy_email_unverified",
      "invalid_legacy_clerk_id",
      "unknown_legacy_user",
    ]);
  });

  test("a batch with any error applies nothing", async () => {
    const t = setup();
    await seedLegacyUser(t);
    await signedIn(t, "alice@example.com", true);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, {
      dryRun: false,
      entries: [aliceEntry, { legacyClerkId: "user_2nobodyHere99", email: "nobody@example.com", emailVerified: true }],
    });
    expect(result.applied).toBe(false);
    expect(result.summary).toMatchObject({ toLink: 1, errors: 1 });
    const legacy = await t.run((ctx) =>
      ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", LEGACY_ID)).unique()
    );
    expect(legacy?.authUserId).toBeUndefined();
  });

  test("duplicate ids or emails within a batch are rejected", async () => {
    const t = setup();
    await seedLegacyUser(t);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, {
      dryRun: true,
      entries: [aliceEntry, { ...aliceEntry, email: "other@example.com" }],
    });
    expect(result.plans.every((plan: { error?: string }) => plan.error === "duplicate_legacy_clerk_id_in_batch")).toBe(true);
  });

  test("an empty provisional account is retired; one with content blocks the link", async () => {
    const t = setup();
    await seedLegacyUser(t);
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);
    await as.mutation(api.users.ensureCurrentUser, {});
    await as.mutation(api.preferences.saveReaderPreferences, PREFS);

    const blocked = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(blocked.applied).toBe(false);
    expect(blocked.plans[0]).toMatchObject({ error: "provisional_account_has_data", detail: ["readerPreferences"] });

    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("readerPreferences")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", authUserId))
        .unique();
      if (prefs) await ctx.db.delete(prefs._id);
    });
    const applied = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(applied.applied).toBe(true);
    expect(applied.plans[0].actions).toEqual(["link_existing_auth_user", "retire_empty_provisional_row"]);
    expect((await as.mutation(api.users.ensureCurrentUser, {})).appUserId).toBe(LEGACY_ID);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
  });

  test("a provisional account whose only content is reading history is neither retired nor linked over", async () => {
    const t = setup();
    await seedLegacyUser(t);
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);
    await as.mutation(api.users.ensureCurrentUser, {});
    // Reading history only: no chapterReads row, no preferences, no notes.
    await as.mutation(api.readingProgress.logReading, {
      source: { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2", volume: "bookofmormon", book: "1-nephi", chapter: 2 },
      journalDate: "2026-10-21",
      requestId: "provisional-read-1",
    });
    const owned = await t.run((ctx) => ctx.db.query("readingLogs").collect());
    expect(owned.map((row) => row.clerkId)).toEqual([authUserId]);

    for (const dryRun of [true, false]) {
      const result = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun, entries: [aliceEntry] });
      expect(result.applied).toBe(false);
      expect(result.plans[0]).toMatchObject({ status: "error", error: "provisional_account_has_data", detail: ["readingLogs"] });
    }

    // The provisional row, its history and the legacy row are all untouched.
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users.map((row) => row.clerkId).sort()).toEqual([LEGACY_ID, authUserId].sort());
    expect(users.find((row) => row.clerkId === LEGACY_ID)?.authUserId).toBeUndefined();
    expect(await as.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("readingLogs").collect())).toEqual(owned);
  });

  test("a legacy id that owns only reading history is recognised as a real legacy owner", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("readingLogs", {
        clerkId: LEGACY_ID,
        source: { kind: "guide", label: "Come, Follow Me", href: "/come-follow-me" },
        journalDate: "2026-10-01",
        readAt: now,
        createdAt: now,
        requestId: "legacy-read-1",
        origin: "manual",
      });
    });
    const { as } = await signedIn(t, "alice@example.com", true);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(result.plans[0].actions).toEqual(["create_legacy_user_row", "link_existing_auth_user"]);
    expect((await as.mutation(api.users.ensureCurrentUser, {})).appUserId).toBe(LEGACY_ID);
    expect(await as.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(1);
  });

  test("can pre-create password-less Better Auth users for legacy accounts", async () => {
    const t = setup();
    await seedLegacyUser(t);
    const missing = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: true, entries: [aliceEntry] });
    expect(missing.plans[0].error).toBe("auth_user_missing");

    const applied = await t.mutation(internal.authMigration.linkLegacyAccounts, {
      dryRun: false,
      createMissingAuthUsers: true,
      entries: [aliceEntry],
    });
    expect(applied.applied).toBe(true);
    const authUserId = applied.plans[0].authUserId as string;
    const authUser = await t.query(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: authUserId }],
    });
    expect(authUser).toMatchObject({ email: "alice@example.com", emailVerified: true });

    const sessionId = await createSession(t, authUserId);
    const as = t.withIdentity({ subject: authUserId, sessionId });
    expect((await as.mutation(api.users.ensureCurrentUser, {})).appUserId).toBe(LEGACY_ID);

    const audit = await t.query(internal.authMigration.auditAuthLinks, {});
    expect(audit).toMatchObject({ legacyUsers: 1, legacyLinked: 1, legacyUnlinked: [], duplicateAuthLinks: [] });
  });

  test("links a legacy id that owns content but never got a users row", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("readerPreferences", { clerkId: LEGACY_ID, ...PREFS, updatedAt: Date.now() });
    });
    await signedIn(t, "alice@example.com", true);
    const result = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });
    expect(result.plans[0].actions).toEqual(["create_legacy_user_row", "link_existing_auth_user"]);
    const row = await t.run((ctx) =>
      ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", LEGACY_ID)).unique()
    );
    expect(row?.authLinkSource).toBe("admin-migration");
  });

  test("a Better Auth user already linked to another legacy account is refused", async () => {
    const t = setup();
    await seedLegacyUser(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { clerkId: "user_2otherLegacy01", createdAt: now, updatedAt: now });
    });
    await signedIn(t, "alice@example.com", true);
    await t.mutation(internal.authMigration.linkLegacyAccounts, {
      dryRun: false,
      entries: [{ legacyClerkId: "user_2otherLegacy01", email: "alice@example.com", emailVerified: true }],
    });
    const second = await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: true, entries: [aliceEntry] });
    expect(second.plans[0].error).toBe("auth_user_linked_to_different_legacy_user");
  });

  test("unlink rolls back one mapping without touching content", async () => {
    const t = setup();
    await seedLegacyUser(t, { isAdmin: true });
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);
    await t.mutation(internal.authMigration.linkLegacyAccounts, { dryRun: false, entries: [aliceEntry] });

    const dry = await t.mutation(internal.authMigration.unlinkLegacyAccount, { legacyClerkId: LEGACY_ID, dryRun: true });
    expect(dry).toMatchObject({ ok: true, previousAuthUserId: authUserId });
    expect((await as.query(api.users.viewer, {}))?.appUserId).toBe(LEGACY_ID);

    await t.mutation(internal.authMigration.unlinkLegacyAccount, { legacyClerkId: LEGACY_ID, dryRun: false });
    expect(await as.query(api.users.viewer, {})).toBeNull();
    expect(await as.query(api.preferences.getReaderPreferences, {})).toBeNull();
    const prefs = await t.run((ctx) =>
      ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q) => q.eq("clerkId", LEGACY_ID)).unique()
    );
    expect(prefs).not.toBeNull();
  });
});

describe("friend lookup by email during the migration window", () => {
  test("prefers the single linked row and refuses to guess between several", async () => {
    const t = setup();
    await seedLegacyUser(t);
    expect(await t.query(api.users.lookupUserByEmail, { email: "ALICE@example.com" })).toBe(LEGACY_ID);
    const { authUserId, as } = await signedIn(t, "alice@example.com", true);
    await as.mutation(api.users.ensureCurrentUser, {});
    expect(await t.query(api.users.lookupUserByEmail, { email: "alice@example.com" })).toBe(authUserId);
  });
});
