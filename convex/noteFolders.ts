import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireClerkId } from "./utils";

const MAX_FOLDER_NAME_LENGTH = 120;
const MAX_IMPORTED_FOLDERS = 200;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function assertValidName(name: string) {
  if (!name) throw new Error("Folder name is required");
  if (name.length > MAX_FOLDER_NAME_LENGTH) throw new Error("Folder name is too long");
}

async function listUserFolders(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return ctx.db
    .query("noteFolders")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .collect();
}

async function getFolderOrThrow(ctx: QueryCtx | MutationCtx, folderId: Id<"noteFolders">, clerkId: string) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.clerkId !== clerkId) throw new Error("Folder not found");
  return folder;
}

async function assertNoCycles(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
  folderId: Id<"noteFolders">,
  parentFolderId: Id<"noteFolders"> | undefined
) {
  if (!parentFolderId) return;
  if (folderId === parentFolderId) throw new Error("Folder cannot be its own parent");
  let current = await ctx.db.get(parentFolderId);
  while (current) {
    if (current.clerkId !== clerkId) throw new Error("Invalid parent folder");
    if (current._id === folderId) throw new Error("Folder hierarchy cycle detected");
    if (!current.parentFolderId) break;
    current = await ctx.db.get(current.parentFolderId);
  }
}

/**
 * Folder hierarchy plus note assignments for the signed-in user, in one
 * subscription so the notes library and the reader side panel stay in sync.
 */
export const getWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);
    const folders = await listUserFolders(ctx, clerkId);
    folders.sort((a, b) => a.name.localeCompare(b.name));

    const assignments = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .collect();

    return {
      folders: folders.map((folder) => ({
        id: folder._id,
        name: folder.name,
        parent_folder_id: folder.parentFolderId ?? null,
      })),
      assignments: assignments.map((row) => ({
        draft_id: row.draftId,
        folder_id: row.folderId,
      })),
    };
  },
});

export const createFolder = mutation({
  args: {
    name: v.string(),
    parentFolderId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const name = normalizeName(args.name);
    assertValidName(name);

    const existing = await listUserFolders(ctx, clerkId);
    if (existing.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Folder already exists");
    }

    if (args.parentFolderId) {
      await getFolderOrThrow(ctx, args.parentFolderId, clerkId);
    }
    const now = Date.now();
    const id = await ctx.db.insert("noteFolders", {
      clerkId,
      name,
      parentFolderId: args.parentFolderId,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const renameFolder = mutation({
  args: {
    folderId: v.id("noteFolders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    await getFolderOrThrow(ctx, args.folderId, clerkId);
    const name = normalizeName(args.name);
    assertValidName(name);
    const existing = await listUserFolders(ctx, clerkId);
    if (existing.some((row) => row._id !== args.folderId && row.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Folder already exists");
    }
    await ctx.db.patch(args.folderId, { name, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Re-parents a folder; omit `parentFolderId` to move it to the root. */
export const moveFolder = mutation({
  args: {
    folderId: v.id("noteFolders"),
    parentFolderId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    await getFolderOrThrow(ctx, args.folderId, clerkId);
    if (args.parentFolderId) await getFolderOrThrow(ctx, args.parentFolderId, clerkId);
    await assertNoCycles(ctx, clerkId, args.folderId, args.parentFolderId);
    await ctx.db.patch(args.folderId, {
      parentFolderId: args.parentFolderId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Deletes a folder; its child folders and its notes move to the root. */
export const deleteFolder = mutation({
  args: {
    folderId: v.id("noteFolders"),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const folder = await getFolderOrThrow(ctx, args.folderId, clerkId);
    const now = Date.now();
    const children = await ctx.db
      .query("noteFolders")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", folder._id))
      .collect();
    for (const child of children) {
      if (child.clerkId !== clerkId) continue;
      await ctx.db.patch(child._id, { parentFolderId: undefined, updatedAt: now });
    }
    const assignments = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
      .collect();
    for (const assignment of assignments) {
      if (assignment.clerkId !== clerkId) continue;
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(args.folderId);
    return { ok: true };
  },
});

/** Files a note under a folder; omit `folderId` to move it back to the root. */
export const assignDraftFolder = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    folderId: v.optional(v.id("noteFolders")),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.clerkId !== clerkId) throw new Error("Draft not found");
    if (args.folderId) await getFolderOrThrow(ctx, args.folderId, clerkId);

    const existing = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_clerk_draft", (q) => q.eq("clerkId", clerkId).eq("draftId", args.draftId))
      .unique();
    if (!args.folderId) {
      if (existing) await ctx.db.delete(existing._id);
      return { ok: true };
    }
    if (existing) {
      await ctx.db.patch(existing._id, { folderId: args.folderId, updatedAt: Date.now() });
      return { ok: true };
    }
    await ctx.db.insert("noteFolderAssignments", {
      clerkId,
      draftId: args.draftId,
      folderId: args.folderId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * One-time import of the folder maps that used to live in localStorage.
 *
 * Idempotent: folders that already exist (by name, case-insensitive) are reused,
 * a parent is only set on folders that have none yet, and a note is only filed
 * if it has no assignment yet. Nothing already in Convex is overwritten.
 */
export const importLocalFolders = mutation({
  args: {
    folderNames: v.array(v.string()),
    /** child folder name -> parent folder name */
    parentMap: v.record(v.string(), v.string()),
    /** draft id -> folder name */
    noteFolderMap: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();

    const wantedNames = new Set<string>();
    const addName = (raw: string) => {
      const name = normalizeName(raw);
      if (name && name.length <= MAX_FOLDER_NAME_LENGTH) wantedNames.add(name);
    };
    args.folderNames.forEach(addName);
    Object.entries(args.parentMap).forEach(([child, parent]) => {
      addName(child);
      addName(parent);
    });
    Object.values(args.noteFolderMap).forEach(addName);

    const existing = await listUserFolders(ctx, clerkId);
    const folderByKey = new Map<string, Doc<"noteFolders">>();
    existing.forEach((folder) => folderByKey.set(folder.name.toLowerCase(), folder));

    let createdFolders = 0;
    for (const name of Array.from(wantedNames).sort((a, b) => a.localeCompare(b))) {
      if (folderByKey.has(name.toLowerCase())) continue;
      if (folderByKey.size >= MAX_IMPORTED_FOLDERS) break;
      const id = await ctx.db.insert("noteFolders", {
        clerkId,
        name,
        parentFolderId: undefined,
        createdAt: now,
        updatedAt: now,
      });
      folderByKey.set(name.toLowerCase(), {
        _id: id,
        _creationTime: now,
        clerkId,
        name,
        parentFolderId: undefined,
        createdAt: now,
        updatedAt: now,
      });
      createdFolders += 1;
    }

    const parentById = new Map<Id<"noteFolders">, Id<"noteFolders"> | undefined>();
    folderByKey.forEach((folder) => parentById.set(folder._id, folder.parentFolderId));
    const createsCycle = (childId: Id<"noteFolders">, parentId: Id<"noteFolders">) => {
      let current: Id<"noteFolders"> | undefined = parentId;
      const seen = new Set<Id<"noteFolders">>();
      while (current) {
        if (current === childId) return true;
        if (seen.has(current)) return true;
        seen.add(current);
        current = parentById.get(current);
      }
      return false;
    };

    let linkedParents = 0;
    for (const [childRaw, parentRaw] of Object.entries(args.parentMap)) {
      const child = folderByKey.get(normalizeName(childRaw).toLowerCase());
      const parent = folderByKey.get(normalizeName(parentRaw).toLowerCase());
      if (!child || !parent || child._id === parent._id) continue;
      if (parentById.get(child._id)) continue;
      if (createsCycle(child._id, parent._id)) continue;
      await ctx.db.patch(child._id, { parentFolderId: parent._id, updatedAt: now });
      parentById.set(child._id, parent._id);
      linkedParents += 1;
    }

    let assignedNotes = 0;
    for (const [draftRaw, folderRaw] of Object.entries(args.noteFolderMap)) {
      const folder = folderByKey.get(normalizeName(folderRaw).toLowerCase());
      if (!folder) continue;
      const draftId = ctx.db.normalizeId("insightDrafts", draftRaw.trim());
      if (!draftId) continue;
      const draft = await ctx.db.get(draftId);
      if (!draft || draft.clerkId !== clerkId) continue;
      const current = await ctx.db
        .query("noteFolderAssignments")
        .withIndex("by_clerk_draft", (q) => q.eq("clerkId", clerkId).eq("draftId", draftId))
        .unique();
      if (current) continue;
      await ctx.db.insert("noteFolderAssignments", {
        clerkId,
        draftId,
        folderId: folder._id,
        updatedAt: now,
      });
      assignedNotes += 1;
    }

    return { createdFolders, linkedParents, assignedNotes };
  },
});
