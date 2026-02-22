// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireClerkId } from "./utils";

const participantModeValidator = v.union(v.literal("guest_only"), v.literal("user_only"), v.literal("both"));
const lessonCardTypeValidator = v.union(v.literal("notes"), v.literal("question"), v.literal("assignment"));
const notesVisibilityValidator = v.union(v.literal("teacher_only"), v.literal("shared_readonly"));
const moderationModeValidator = v.union(v.literal("moderated_reveal"), v.literal("auto_publish"), v.literal("hidden_only"));
const revealStateValidator = v.union(v.literal("hidden"), v.literal("revealed"));
const groupModeValidator = v.union(v.literal("manual"), v.literal("auto_even"), v.literal("self_select"));
const questionModeValidator = v.union(v.literal("shared"), v.literal("per_group"), v.literal("both"));
const questionResponseStatusValidator = v.union(v.literal("pending"), v.literal("visible"), v.literal("hidden"));
const noteComponentTypeValidator = v.union(
  v.literal("text"),
  v.literal("scripture"),
  v.literal("quote"),
  v.literal("dictionary")
);
const scriptureRefValidator = v.object({
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  verseStart: v.number(),
  verseEnd: v.number(),
  reference: v.string(),
});
const dictionaryMetaValidator = v.object({
  edition: v.union(v.literal("1828"), v.literal("1844"), v.literal("1913"), v.literal("ETY")),
  word: v.string(),
  heading: v.optional(v.string()),
  pronounce: v.optional(v.string()),
});

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function normalizeText(value: string | undefined, max = 4000): string | undefined {
  const out = (value ?? "").trim();
  if (!out) return undefined;
  return out.slice(0, max);
}

function makeToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const size = 36;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < size; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  let out = "";
  for (let i = 0; i < size; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function getLessonByToken(ctx: any, token: string) {
  const row = await ctx.db.query("lessonShareLinks").withIndex("by_token", (q: any) => q.eq("token", token)).unique();
  if (!row || !row.active) throw new Error("Lesson link is invalid");
  const lesson = await ctx.db.get(row.lessonId);
  if (!lesson) throw new Error("Lesson not found");
  if (lesson.linkState !== "active") throw new Error("Lesson link is disabled");
  return { link: row, lesson };
}

async function requireLessonOwner(ctx: any, lessonId: any): Promise<any> {
  const clerkId = await requireClerkId(ctx);
  const lesson = await ctx.db.get(lessonId);
  if (!lesson || lesson.ownerClerkId !== clerkId) throw new Error("Not allowed");
  return { lesson, clerkId };
}

async function getDisplayName(ctx: any, clerkId: string): Promise<string> {
  const user = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
  if (user?.displayName?.trim()) return user.displayName.trim();
  if (user?.email?.trim()) return user.email.trim();
  return `User ${clerkId.slice(0, 6)}`;
}

async function ensureParticipant(ctx: any, lessonId: any, participantId: any) {
  const participant = await ctx.db.get(participantId);
  if (!participant || participant.lessonId !== lessonId) throw new Error("Participant not found");
  return participant;
}

async function autoAssignParticipantToEvenGroups(ctx: any, lessonId: any, participantId: any) {
  const cards = await ctx.db.query("lessonPlanCards").withIndex("by_lesson", (q: any) => q.eq("lessonId", lessonId)).collect();
  for (const card of cards) {
    if (card.archivedAt || card.type !== "assignment" || (card.groupMode ?? "manual") !== "auto_even") continue;
    const existing = await ctx.db
      .query("lessonGroupMembers")
      .withIndex("by_card_participant", (q: any) => q.eq("cardId", card._id).eq("participantId", participantId))
      .unique();
    if (existing) continue;

    const groups = await ctx.db.query("lessonCardGroups").withIndex("by_card_order", (q: any) => q.eq("cardId", card._id)).collect();
    if (groups.length === 0) continue;

    let selectedGroup = groups[0];
    let minCount = Number.POSITIVE_INFINITY;
    for (const group of groups) {
      const members = await ctx.db.query("lessonGroupMembers").withIndex("by_group", (q: any) => q.eq("groupId", group._id)).collect();
      if (members.length < minCount) {
        minCount = members.length;
        selectedGroup = group;
      }
    }
    await ctx.db.insert("lessonGroupMembers", {
      lessonId,
      cardId: card._id,
      groupId: selectedGroup._id,
      participantId,
      assignedBy: "auto",
      createdAt: Date.now(),
    });
  }
}

export const createLesson = mutation({
  args: {
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    participantMode: v.optional(participantModeValidator),
  },
  handler: async (ctx, args) => {
    const ownerClerkId = await requireClerkId(ctx);
    const now = Date.now();
    const lessonId = await ctx.db.insert("lessonPlans", {
      ownerClerkId,
      title: normalizeText(args.title, 180) ?? "Untitled lesson",
      description: normalizeText(args.description, 5000),
      participantMode: args.participantMode ?? "both",
      linkState: "active",
      createdAt: now,
      updatedAt: now,
    });
    const token = makeToken();
    await ctx.db.insert("lessonShareLinks", {
      lessonId,
      token,
      active: true,
      createdByClerkId: ownerClerkId,
      createdAt: now,
    });
    return { id: lessonId, token };
  },
});

export const listMyLessons = query({
  args: {},
  handler: async (ctx) => {
    const ownerClerkId = await requireClerkId(ctx);
    const lessons = await ctx.db
      .query("lessonPlans")
      .withIndex("by_owner_updated", (q: any) => q.eq("ownerClerkId", ownerClerkId))
      .order("desc")
      .collect();

    const out = [];
    for (const lesson of lessons) {
      const activeLink = await ctx.db
        .query("lessonShareLinks")
        .withIndex("by_lesson_active", (q: any) => q.eq("lessonId", lesson._id).eq("active", true))
        .first();
      out.push({
        id: lesson._id,
        title: lesson.title,
        description: lesson.description ?? null,
        participant_mode: lesson.participantMode,
        link_state: lesson.linkState,
        active_token: activeLink?.token ?? null,
        created_at: toIso(lesson.createdAt),
        updated_at: toIso(lesson.updatedAt),
      });
    }
    return out;
  },
});

export const getLessonEditor = query({
  args: { lessonId: v.id("lessonPlans") },
  handler: async (ctx, args) => {
    const { lesson } = await requireLessonOwner(ctx, args.lessonId);
    const cards = await ctx.db
      .query("lessonPlanCards")
      .withIndex("by_lesson_order", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    const activeLink = await ctx.db
      .query("lessonShareLinks")
      .withIndex("by_lesson_active", (q: any) => q.eq("lessonId", args.lessonId).eq("active", true))
      .first();

    const groupsByCard: Record<string, any[]> = {};
    for (const card of cards) {
      const groups =
        card.type === "assignment"
          ? await ctx.db.query("lessonCardGroups").withIndex("by_card_order", (q: any) => q.eq("cardId", card._id)).collect()
          : [];
      groupsByCard[String(card._id)] = groups.map((g) => ({
        id: g._id,
        name: g.name,
        order: g.order,
        scripture_refs: g.scriptureRefs,
        prompt: g.prompt ?? null,
      }));
    }

    return {
      id: lesson._id,
      title: lesson.title,
      description: lesson.description ?? null,
      participant_mode: lesson.participantMode,
      link_state: lesson.linkState,
      active_token: activeLink?.token ?? null,
      created_at: toIso(lesson.createdAt),
      updated_at: toIso(lesson.updatedAt),
      cards: cards
        .filter((card) => !card.archivedAt)
        .map((card) => ({
          id: card._id,
          order: card.order,
          type: card.type,
          title: card.title ?? null,
          body: card.body ?? null,
          note_component_type: card.noteComponentType ?? "text",
          link_url: card.linkUrl ?? null,
          highlight_text: card.highlightText ?? null,
          highlight_word_indices: card.highlightWordIndices ?? [],
          scripture_ref: card.scriptureRef ?? null,
          dictionary_meta: card.dictionaryMeta ?? null,
          notes_visibility: card.notesVisibility ?? null,
          question_prompt: card.questionPrompt ?? null,
          is_anonymous: card.isAnonymous ?? true,
          moderation_mode: card.moderationMode ?? "moderated_reveal",
          reveal_state: card.revealState ?? "hidden",
          group_mode: card.groupMode ?? "manual",
          question_mode: card.questionMode ?? "both",
          shared_question: card.sharedQuestion ?? null,
          groups: groupsByCard[String(card._id)] ?? [],
          created_at: toIso(card.createdAt),
          updated_at: toIso(card.updatedAt),
        })),
    };
  },
});

export const renameLesson = mutation({
  args: { lessonId: v.id("lessonPlans"), title: v.string() },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const title = normalizeText(args.title, 180);
    if (!title) throw new Error("Title is required");
    await ctx.db.patch(args.lessonId, { title, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const updateLessonSettings = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    description: v.optional(v.string()),
    participantMode: v.optional(participantModeValidator),
    linkState: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.description !== undefined) patch.description = normalizeText(args.description, 5000);
    if (args.participantMode !== undefined) patch.participantMode = args.participantMode;
    if (args.linkState !== undefined) patch.linkState = args.linkState;
    await ctx.db.patch(args.lessonId, patch);
    return { ok: true };
  },
});

export const deleteLesson = mutation({
  args: { lessonId: v.id("lessonPlans") },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);

    const cards = await ctx.db.query("lessonPlanCards").withIndex("by_lesson", (q: any) => q.eq("lessonId", args.lessonId)).collect();
    const participants = await ctx.db
      .query("lessonParticipants")
      .withIndex("by_lesson", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    const groups = await ctx.db
      .query("lessonCardGroups")
      .withIndex("by_lesson_card", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    const responses = await ctx.db
      .query("lessonQuestionResponses")
      .withIndex("by_lesson_created", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    const links = await ctx.db
      .query("lessonShareLinks")
      .withIndex("by_lesson_active", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    const events = await ctx.db
      .query("lessonActivityEvents")
      .withIndex("by_lesson_created", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();

    for (const item of cards) await ctx.db.delete(item._id);
    for (const item of participants) await ctx.db.delete(item._id);
    for (const item of groups) await ctx.db.delete(item._id);
    for (const item of responses) await ctx.db.delete(item._id);
    for (const item of links) await ctx.db.delete(item._id);
    for (const item of events) await ctx.db.delete(item._id);

    const groupMembers = await Promise.all(
      cards.map((card) => ctx.db.query("lessonGroupMembers").withIndex("by_card_participant", (q: any) => q.eq("cardId", card._id)).collect())
    );
    for (const members of groupMembers.flat()) await ctx.db.delete(members._id);

    await ctx.db.delete(args.lessonId);
    return { ok: true };
  },
});

export const addCard = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    type: lessonCardTypeValidator,
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    notesVisibility: v.optional(notesVisibilityValidator),
    questionPrompt: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    moderationMode: v.optional(moderationModeValidator),
    revealState: v.optional(revealStateValidator),
    groupMode: v.optional(groupModeValidator),
    questionMode: v.optional(questionModeValidator),
    sharedQuestion: v.optional(v.string()),
    noteComponentType: v.optional(noteComponentTypeValidator),
    linkUrl: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    scriptureRef: v.optional(scriptureRefValidator),
    dictionaryMeta: v.optional(dictionaryMetaValidator),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const cards = await ctx.db.query("lessonPlanCards").withIndex("by_lesson_order", (q: any) => q.eq("lessonId", args.lessonId)).collect();
    const now = Date.now();
    const id = await ctx.db.insert("lessonPlanCards", {
      lessonId: args.lessonId,
      order: cards.length,
      type: args.type,
      title: normalizeText(args.title, 180),
      body: normalizeText(args.body, 20000),
      noteComponentType: args.type === "notes" ? args.noteComponentType ?? "text" : undefined,
      linkUrl: args.type === "notes" ? normalizeText(args.linkUrl, 2000) : undefined,
      highlightText: args.type === "notes" ? normalizeText(args.highlightText, 3000) : undefined,
      highlightWordIndices: args.type === "notes" ? args.highlightWordIndices : undefined,
      scriptureRef: args.type === "notes" ? args.scriptureRef : undefined,
      dictionaryMeta: args.type === "notes" ? args.dictionaryMeta : undefined,
      notesVisibility: args.type === "notes" ? args.notesVisibility ?? "teacher_only" : undefined,
      questionPrompt: args.type === "question" ? normalizeText(args.questionPrompt, 1200) : undefined,
      isAnonymous: args.type === "question" ? args.isAnonymous ?? true : undefined,
      moderationMode: args.type === "question" ? args.moderationMode ?? "moderated_reveal" : undefined,
      revealState: args.type === "question" ? args.revealState ?? "hidden" : undefined,
      groupMode: args.type === "assignment" ? args.groupMode ?? "manual" : undefined,
      questionMode: args.type === "assignment" ? args.questionMode ?? "both" : undefined,
      sharedQuestion: args.type === "assignment" ? normalizeText(args.sharedQuestion, 1200) : undefined,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.lessonId, { updatedAt: now });
    return { id };
  },
});

export const updateCard = mutation({
  args: {
    cardId: v.id("lessonPlanCards"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    notesVisibility: v.optional(notesVisibilityValidator),
    questionPrompt: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    moderationMode: v.optional(moderationModeValidator),
    revealState: v.optional(revealStateValidator),
    groupMode: v.optional(groupModeValidator),
    questionMode: v.optional(questionModeValidator),
    sharedQuestion: v.optional(v.string()),
    noteComponentType: v.optional(noteComponentTypeValidator),
    linkUrl: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    scriptureRef: v.optional(scriptureRefValidator),
    dictionaryMeta: v.optional(dictionaryMetaValidator),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found");
    await requireLessonOwner(ctx, card.lessonId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = normalizeText(args.title, 180);
    if (args.body !== undefined) patch.body = normalizeText(args.body, 20000);
    if (args.noteComponentType !== undefined) patch.noteComponentType = args.noteComponentType;
    if (args.linkUrl !== undefined) patch.linkUrl = normalizeText(args.linkUrl, 2000);
    if (args.highlightText !== undefined) patch.highlightText = normalizeText(args.highlightText, 3000);
    if (args.highlightWordIndices !== undefined) patch.highlightWordIndices = args.highlightWordIndices;
    if (args.scriptureRef !== undefined) patch.scriptureRef = args.scriptureRef;
    if (args.dictionaryMeta !== undefined) patch.dictionaryMeta = args.dictionaryMeta;
    if (args.notesVisibility !== undefined) patch.notesVisibility = args.notesVisibility;
    if (args.questionPrompt !== undefined) patch.questionPrompt = normalizeText(args.questionPrompt, 1200);
    if (args.isAnonymous !== undefined) patch.isAnonymous = args.isAnonymous;
    if (args.moderationMode !== undefined) patch.moderationMode = args.moderationMode;
    if (args.revealState !== undefined) patch.revealState = args.revealState;
    if (args.groupMode !== undefined) patch.groupMode = args.groupMode;
    if (args.questionMode !== undefined) patch.questionMode = args.questionMode;
    if (args.sharedQuestion !== undefined) patch.sharedQuestion = normalizeText(args.sharedQuestion, 1200);

    await ctx.db.patch(args.cardId, patch);
    await ctx.db.patch(card.lessonId, { updatedAt: Date.now() });
    return { ok: true };
  },
});

export const addAssignmentGroup = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    cardId: v.id("lessonPlanCards"),
    name: v.string(),
    prompt: v.optional(v.string()),
    scriptureRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== args.lessonId || card.type !== "assignment") throw new Error("Assignment card not found");
    const groups = await ctx.db.query("lessonCardGroups").withIndex("by_card_order", (q: any) => q.eq("cardId", args.cardId)).collect();
    const now = Date.now();
    const id = await ctx.db.insert("lessonCardGroups", {
      lessonId: args.lessonId,
      cardId: args.cardId,
      name: normalizeText(args.name, 120) ?? "Group",
      order: groups.length,
      scriptureRefs: (args.scriptureRefs ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 20),
      prompt: normalizeText(args.prompt, 1200),
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const updateAssignmentGroup = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    groupId: v.id("lessonCardGroups"),
    name: v.optional(v.string()),
    prompt: v.optional(v.string()),
    scriptureRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.lessonId !== args.lessonId) throw new Error("Group not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = normalizeText(args.name, 120) ?? "Group";
    if (args.prompt !== undefined) patch.prompt = normalizeText(args.prompt, 1200);
    if (args.scriptureRefs !== undefined) patch.scriptureRefs = args.scriptureRefs.map((x) => x.trim()).filter(Boolean).slice(0, 20);
    await ctx.db.patch(args.groupId, patch);
    return { ok: true };
  },
});

export const deleteAssignmentGroup = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    groupId: v.id("lessonCardGroups"),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.lessonId !== args.lessonId) throw new Error("Group not found");
    const memberships = await ctx.db.query("lessonGroupMembers").withIndex("by_group", (q: any) => q.eq("groupId", args.groupId)).collect();
    for (const member of memberships) await ctx.db.delete(member._id);
    await ctx.db.delete(args.groupId);
    return { ok: true };
  },
});

export const assignParticipantToGroup = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    cardId: v.id("lessonPlanCards"),
    groupId: v.id("lessonCardGroups"),
    participantId: v.id("lessonParticipants"),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== args.lessonId || card.type !== "assignment") throw new Error("Assignment card not found");
    const participant = await ensureParticipant(ctx, args.lessonId, args.participantId);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.cardId !== args.cardId) throw new Error("Group not found");
    const existing = await ctx.db
      .query("lessonGroupMembers")
      .withIndex("by_card_participant", (q: any) => q.eq("cardId", args.cardId).eq("participantId", participant._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    const id = await ctx.db.insert("lessonGroupMembers", {
      lessonId: args.lessonId,
      cardId: args.cardId,
      groupId: args.groupId,
      participantId: args.participantId,
      assignedBy: "teacher",
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const deleteCard = mutation({
  args: { cardId: v.id("lessonPlanCards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found");
    await requireLessonOwner(ctx, card.lessonId);

    await ctx.db.patch(args.cardId, { archivedAt: Date.now(), updatedAt: Date.now() });

    const cards = await ctx.db
      .query("lessonPlanCards")
      .withIndex("by_lesson_order", (q: any) => q.eq("lessonId", card.lessonId))
      .collect();
    const visible = cards.filter((x) => !x.archivedAt).sort((a, b) => a.order - b.order);
    for (let i = 0; i < visible.length; i += 1) {
      if (visible[i].order !== i) await ctx.db.patch(visible[i]._id, { order: i, updatedAt: Date.now() });
    }

    await ctx.db.patch(card.lessonId, { updatedAt: Date.now() });
    return { ok: true };
  },
});

export const reorderCards = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    cardIds: v.array(v.id("lessonPlanCards")),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const cards = await ctx.db.query("lessonPlanCards").withIndex("by_lesson", (q: any) => q.eq("lessonId", args.lessonId)).collect();
    const activeCards = cards.filter((card) => !card.archivedAt);
    if (args.cardIds.length !== activeCards.length) throw new Error("Reorder payload mismatch");

    const activeSet = new Set(activeCards.map((c) => String(c._id)));
    for (const id of args.cardIds) {
      if (!activeSet.has(String(id))) throw new Error("Invalid card id");
    }

    const now = Date.now();
    for (let i = 0; i < args.cardIds.length; i += 1) {
      await ctx.db.patch(args.cardIds[i], { order: i, updatedAt: now });
    }
    await ctx.db.patch(args.lessonId, { updatedAt: now });
    return { ok: true };
  },
});

export const createShareLink = mutation({
  args: { lessonId: v.id("lessonPlans") },
  handler: async (ctx, args) => {
    const { clerkId } = await requireLessonOwner(ctx, args.lessonId);
    const current = await ctx.db
      .query("lessonShareLinks")
      .withIndex("by_lesson_active", (q: any) => q.eq("lessonId", args.lessonId).eq("active", true))
      .first();
    if (current) return { token: current.token };

    const token = makeToken();
    await ctx.db.insert("lessonShareLinks", {
      lessonId: args.lessonId,
      token,
      active: true,
      createdByClerkId: clerkId,
      createdAt: Date.now(),
    });
    return { token };
  },
});

export const rotateShareLink = mutation({
  args: { lessonId: v.id("lessonPlans") },
  handler: async (ctx, args) => {
    const { clerkId } = await requireLessonOwner(ctx, args.lessonId);
    const now = Date.now();
    const activeLinks = await ctx.db
      .query("lessonShareLinks")
      .withIndex("by_lesson_active", (q: any) => q.eq("lessonId", args.lessonId).eq("active", true))
      .collect();

    for (const link of activeLinks) {
      await ctx.db.patch(link._id, { active: false, rotatedAt: now, disabledAt: now });
    }

    const token = makeToken();
    await ctx.db.insert("lessonShareLinks", {
      lessonId: args.lessonId,
      token,
      active: true,
      createdByClerkId: clerkId,
      createdAt: now,
      rotatedAt: now,
    });
    await ctx.db.patch(args.lessonId, { updatedAt: now });
    return { token };
  },
});

export const getLessonByLink = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    return {
      id: lesson._id,
      title: lesson.title,
      description: lesson.description ?? null,
      participant_mode: lesson.participantMode,
      link_state: lesson.linkState,
      updated_at: toIso(lesson.updatedAt),
    };
  },
});

export const joinLessonAsGuest = mutation({
  args: {
    token: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    if (lesson.participantMode === "user_only") throw new Error("This lesson requires sign in");
    const name = normalizeText(args.name, 80);
    if (!name) throw new Error("Name is required");

    const now = Date.now();
    const participantId = await ctx.db.insert("lessonParticipants", {
      lessonId: lesson._id,
      identityType: "guest",
      guestName: name,
      displayName: name,
      joinedAt: now,
      lastSeenAt: now,
    });
    await autoAssignParticipantToEvenGroups(ctx, lesson._id, participantId);
    return { participantId, displayName: name };
  },
});

export const joinLessonAsUser = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const { lesson } = await getLessonByToken(ctx, args.token);
    if (lesson.participantMode === "guest_only") throw new Error("This lesson only supports guests");

    const existing = await ctx.db
      .query("lessonParticipants")
      .withIndex("by_lesson_clerk", (q: any) => q.eq("lessonId", lesson._id).eq("clerkId", clerkId))
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
      await autoAssignParticipantToEvenGroups(ctx, lesson._id, existing._id);
      return { participantId: existing._id, displayName: existing.displayName };
    }

    const displayName = await getDisplayName(ctx, clerkId);
    const participantId = await ctx.db.insert("lessonParticipants", {
      lessonId: lesson._id,
      identityType: "user",
      clerkId,
      displayName,
      joinedAt: now,
      lastSeenAt: now,
    });
    await autoAssignParticipantToEvenGroups(ctx, lesson._id, participantId);

    return { participantId, displayName };
  },
});

export const listParticipantView = query({
  args: {
    token: v.string(),
    participantId: v.id("lessonParticipants"),
  },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    const participant = await ensureParticipant(ctx, lesson._id, args.participantId);

    await ctx.db.patch(args.participantId, { lastSeenAt: Date.now() });

    const cards = await ctx.db
      .query("lessonPlanCards")
      .withIndex("by_lesson_order", (q: any) => q.eq("lessonId", lesson._id))
      .collect();

    const cardOut = [];
    for (const card of cards.filter((x) => !x.archivedAt).sort((a, b) => a.order - b.order)) {
      if (card.type === "notes" && (card.notesVisibility ?? "teacher_only") === "teacher_only") {
        continue;
      }

      let visibleResponses: any[] = [];
      if (card.type === "question") {
        const rows = await ctx.db
          .query("lessonQuestionResponses")
          .withIndex("by_card_created", (q: any) => q.eq("cardId", card._id))
          .collect();
        const visible = rows.filter((r) => !r.deletedAt && r.status === "visible");

        if ((card.revealState ?? "hidden") === "revealed") {
          visibleResponses = await Promise.all(
            visible.map(async (r) => {
              const p = await ctx.db.get(r.participantId);
              return {
                id: r._id,
                body: r.body,
                created_at: toIso(r.createdAt),
                participant_name: (card.isAnonymous ?? true) ? null : p?.displayName ?? "Participant",
              };
            })
          );
        }
      }

      let myResponses: any[] = [];
      if (card.type === "question") {
        const mine = await ctx.db
          .query("lessonQuestionResponses")
          .withIndex("by_participant_card", (q: any) => q.eq("participantId", participant._id).eq("cardId", card._id))
          .collect();
        myResponses = mine
          .filter((r) => !r.deletedAt)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => ({
            id: r._id,
            body: r.body,
            status: r.status,
            created_at: toIso(r.createdAt),
          }));
      }

      let groups: any[] = [];
      let myGroupId: string | null = null;
      if (card.type === "assignment") {
        const rows = await ctx.db.query("lessonCardGroups").withIndex("by_card_order", (q: any) => q.eq("cardId", card._id)).collect();
        groups = rows.map((g) => ({
          id: g._id,
          name: g.name,
          order: g.order,
          scripture_refs: g.scriptureRefs,
          prompt: g.prompt ?? null,
        }));

        const membership = await ctx.db
          .query("lessonGroupMembers")
          .withIndex("by_card_participant", (q: any) => q.eq("cardId", card._id).eq("participantId", participant._id))
          .unique();
        myGroupId = membership ? String(membership.groupId) : null;
      }

      cardOut.push({
        id: card._id,
        order: card.order,
        type: card.type,
        title: card.title ?? null,
        body: card.body ?? null,
        note_component_type: card.noteComponentType ?? "text",
        link_url: card.linkUrl ?? null,
        highlight_text: card.highlightText ?? null,
        highlight_word_indices: card.highlightWordIndices ?? [],
        scripture_ref: card.scriptureRef ?? null,
        dictionary_meta: card.dictionaryMeta ?? null,
        notes_visibility: card.notesVisibility ?? null,
        question_prompt: card.questionPrompt ?? null,
        is_anonymous: card.isAnonymous ?? true,
        moderation_mode: card.moderationMode ?? "moderated_reveal",
        reveal_state: card.revealState ?? "hidden",
        visible_responses: visibleResponses,
        my_responses: myResponses,
        group_mode: card.groupMode ?? "manual",
        question_mode: card.questionMode ?? "both",
        shared_question: card.sharedQuestion ?? null,
        groups,
        my_group_id: myGroupId,
      });
    }

    return {
      lesson: {
        id: lesson._id,
        title: lesson.title,
        description: lesson.description ?? null,
      },
      participant: {
        id: participant._id,
        identity_type: participant.identityType,
        display_name: participant.displayName,
      },
      cards: cardOut,
    };
  },
});

export const submitQuestionResponse = mutation({
  args: {
    token: v.string(),
    participantId: v.id("lessonParticipants"),
    cardId: v.id("lessonPlanCards"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    await ensureParticipant(ctx, lesson._id, args.participantId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== lesson._id || card.type !== "question" || card.archivedAt) {
      throw new Error("Question card not found");
    }

    const body = normalizeText(args.body, 2000);
    if (!body) throw new Error("Response is required");

    const mine = await ctx.db
      .query("lessonQuestionResponses")
      .withIndex("by_participant_card", (q: any) => q.eq("participantId", args.participantId).eq("cardId", args.cardId))
      .collect();
    const last = mine.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last && Date.now() - last.createdAt < 3000) throw new Error("Please wait a moment before submitting again");

    const status =
      (card.moderationMode ?? "moderated_reveal") === "auto_publish"
        ? "visible"
        : (card.moderationMode ?? "moderated_reveal") === "hidden_only"
        ? "hidden"
        : "pending";

    const now = Date.now();
    const id = await ctx.db.insert("lessonQuestionResponses", {
      lessonId: lesson._id,
      cardId: args.cardId,
      participantId: args.participantId,
      body,
      status,
      createdAt: now,
      updatedAt: now,
    });
    return { id, status };
  },
});

export const deleteOwnQuestionResponse = mutation({
  args: {
    token: v.string(),
    participantId: v.id("lessonParticipants"),
    responseId: v.id("lessonQuestionResponses"),
  },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    await ensureParticipant(ctx, lesson._id, args.participantId);

    const response = await ctx.db.get(args.responseId);
    if (!response || response.lessonId !== lesson._id || response.participantId !== args.participantId) {
      throw new Error("Response not found");
    }

    await ctx.db.patch(args.responseId, { deletedAt: Date.now(), updatedAt: Date.now() });
    return { ok: true };
  },
});

export const joinAssignmentGroup = mutation({
  args: {
    token: v.string(),
    participantId: v.id("lessonParticipants"),
    cardId: v.id("lessonPlanCards"),
    groupId: v.id("lessonCardGroups"),
  },
  handler: async (ctx, args) => {
    const { lesson } = await getLessonByToken(ctx, args.token);
    await ensureParticipant(ctx, lesson._id, args.participantId);

    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== lesson._id || card.type !== "assignment") throw new Error("Assignment not found");
    if ((card.groupMode ?? "manual") !== "self_select") throw new Error("Self-selection is not enabled");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.cardId !== args.cardId) throw new Error("Group not found");

    const existing = await ctx.db
      .query("lessonGroupMembers")
      .withIndex("by_card_participant", (q: any) => q.eq("cardId", args.cardId).eq("participantId", args.participantId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);

    const id = await ctx.db.insert("lessonGroupMembers", {
      lessonId: lesson._id,
      cardId: args.cardId,
      groupId: args.groupId,
      participantId: args.participantId,
      assignedBy: "self",
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const listQuestionResponses = query({
  args: {
    lessonId: v.id("lessonPlans"),
    cardId: v.id("lessonPlanCards"),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== args.lessonId || card.type !== "question") throw new Error("Card not found");

    const rows = await ctx.db
      .query("lessonQuestionResponses")
      .withIndex("by_card_created", (q: any) => q.eq("cardId", args.cardId))
      .collect();

    return await Promise.all(
      rows
        .filter((r) => !r.deletedAt)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (r) => {
          const participant = await ctx.db.get(r.participantId);
          return {
            id: r._id,
            body: r.body,
            status: r.status,
            created_at: toIso(r.createdAt),
            participant_id: r.participantId,
            participant_name: participant?.displayName ?? "Participant",
            identity_type: participant?.identityType ?? "guest",
          };
        })
    );
  },
});

export const listLessonParticipants = query({
  args: { lessonId: v.id("lessonPlans") },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const rows = await ctx.db
      .query("lessonParticipants")
      .withIndex("by_lesson", (q: any) => q.eq("lessonId", args.lessonId))
      .collect();
    return rows
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((row) => ({
        id: row._id,
        display_name: row.displayName,
        identity_type: row.identityType,
        joined_at: toIso(row.joinedAt),
        last_seen_at: toIso(row.lastSeenAt),
      }));
  },
});

export const setResponseVisibility = mutation({
  args: {
    lessonId: v.id("lessonPlans"),
    responseId: v.id("lessonQuestionResponses"),
    status: v.union(v.literal("visible"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const row = await ctx.db.get(args.responseId);
    if (!row || row.lessonId !== args.lessonId) throw new Error("Response not found");

    await ctx.db.patch(args.responseId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const revealQuestionCard = mutation({
  args: { lessonId: v.id("lessonPlans"), cardId: v.id("lessonPlanCards") },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== args.lessonId || card.type !== "question") throw new Error("Card not found");
    await ctx.db.patch(args.cardId, { revealState: "revealed", updatedAt: Date.now() });
    return { ok: true };
  },
});

export const hideQuestionCard = mutation({
  args: { lessonId: v.id("lessonPlans"), cardId: v.id("lessonPlanCards") },
  handler: async (ctx, args) => {
    await requireLessonOwner(ctx, args.lessonId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.lessonId !== args.lessonId || card.type !== "question") throw new Error("Card not found");
    await ctx.db.patch(args.cardId, { revealState: "hidden", updatedAt: Date.now() });
    return { ok: true };
  },
});
