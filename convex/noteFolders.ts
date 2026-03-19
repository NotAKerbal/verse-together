// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function getFolderOrThrow(ctx: any, folderId: any, clerkId: string) {
  const folder = await ctx.db.get(folderId);
  if (!folder || folder.clerkId !== clerkId) throw new Error("Folder not found");
  return folder;
}

async function assertNoCycles(ctx: any, clerkId: string, folderId: any, parentFolderId: any) {
  if (!parentFolderId) return;
  if (String(folderId) === String(parentFolderId)) throw new Error("Folder cannot be its own parent");
  let current = await ctx.db.get(parentFolderId);
  while (current) {
    if (current.clerkId !== clerkId) throw new Error("Invalid parent folder");
    if (String(current._id) === String(folderId)) throw new Error("Folder hierarchy cycle detected");
    if (!current.parentFolderId) break;
    current = await ctx.db.get(current.parentFolderId);
  }
}

export const getWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);
    const folders = await ctx.db.query("noteFolders").withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId)).collect();
    folders.sort((a, b) => a.name.localeCompare(b.name));

    const assignments = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId))
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
    if (!name) throw new Error("Folder name is required");
    if (name.length > 120) throw new Error("Folder name is too long");

    const existing = await ctx.db.query("noteFolders").withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId)).collect();
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
    if (!name) throw new Error("Folder name is required");
    if (name.length > 120) throw new Error("Folder name is too long");
    const existing = await ctx.db.query("noteFolders").withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId)).collect();
    if (existing.some((row) => String(row._id) !== String(args.folderId) && row.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("Folder already exists");
    }
    await ctx.db.patch(args.folderId, { name, updatedAt: Date.now() });
    return { ok: true };
  },
});

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

export const deleteFolder = mutation({
  args: {
    folderId: v.id("noteFolders"),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const folder = await getFolderOrThrow(ctx, args.folderId, clerkId);
    const children = await ctx.db.query("noteFolders").withIndex("by_parent", (q: any) => q.eq("parentFolderId", folder._id)).collect();
    for (const child of children) {
      if (child.clerkId !== clerkId) continue;
      await ctx.db.patch(child._id, { parentFolderId: undefined, updatedAt: Date.now() });
    }
    const assignments = await ctx.db.query("noteFolderAssignments").withIndex("by_folder", (q: any) => q.eq("folderId", folder._id)).collect();
    for (const assignment of assignments) {
      if (assignment.clerkId !== clerkId) continue;
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(args.folderId);
    return { ok: true };
  },
});

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
      .withIndex("by_clerk_draft", (q: any) => q.eq("clerkId", clerkId).eq("draftId", args.draftId))
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
