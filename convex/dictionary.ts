// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const editionValidator = v.union(v.literal("1828"), v.literal("1844"), v.literal("1913"));
const editions = ["1828", "1844", "1913"] as const;

function normalizeLookupKey(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateLookupCandidates(term: string): string[] {
  const base = normalizeLookupKey(term);
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.endsWith("ies")) out.add(`${base.slice(0, -3)}y`);
  if (/(sses|xes|zes|ches|shes)$/.test(base)) out.add(base.slice(0, -2));
  if (base.endsWith("s") && !base.endsWith("ss")) out.add(base.slice(0, -1));
  out.add(base.replace(/-/g, ""));
  return Array.from(out).filter(Boolean);
}

function serializeEntry(entry: any) {
  return {
    id: String(entry._id),
    edition: entry.edition,
    word: entry.word,
    lookupKey: entry.lookupKey,
    heading: entry.heading ?? null,
    entryText: entry.entryText,
    sourceId: entry.sourceId ?? null,
    pronounce: entry.pronounce ?? null,
  };
}

async function lookupEdition(ctx: any, edition: "1828" | "1844" | "1913", term: string) {
  const candidates = generateLookupCandidates(term);
  for (const lookupKey of candidates) {
    const rows = await ctx.db
      .query("dictionaryEntries")
      .withIndex("by_edition_lookupKey", (q: any) => q.eq("edition", edition).eq("lookupKey", lookupKey))
      .collect();
    if (rows.length > 0) {
      rows.sort((a, b) => (a.sourceId ?? 0) - (b.sourceId ?? 0));
      return {
        matchedKey: lookupKey,
        entries: rows.map(serializeEntry),
      };
    }
  }
  return null;
}

export const getEntryByWord = query({
  args: { edition: editionValidator, term: v.string() },
  handler: async (ctx, args) => {
    const result = await lookupEdition(ctx, args.edition, args.term);
    return {
      term: args.term,
      candidates: generateLookupCandidates(args.term),
      result,
    };
  },
});

export const getEntriesByWord = query({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    const byEdition: Record<string, any> = {};
    for (const edition of editions) {
      byEdition[edition] = await lookupEdition(ctx, edition, args.term);
    }
    return {
      term: args.term,
      candidates: generateLookupCandidates(args.term),
      byEdition,
    };
  },
});

export const upsertEntriesBatch = mutation({
  args: {
    entries: v.array(
      v.object({
        edition: editionValidator,
        word: v.string(),
        lookupKey: v.string(),
        heading: v.optional(v.string()),
        entryText: v.string(),
        sourceTable: v.optional(v.string()),
        sourceId: v.optional(v.number()),
        length: v.optional(v.number()),
        pronounce: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const entry of args.entries) {
      const existingRows = await ctx.db
        .query("dictionaryEntries")
        .withIndex("by_edition_lookupKey", (q: any) =>
          q.eq("edition", entry.edition).eq("lookupKey", entry.lookupKey)
        )
        .collect();

      const matching = existingRows.find((row: any) => {
        if (entry.sourceId !== undefined && row.sourceId !== undefined) {
          return row.sourceId === entry.sourceId;
        }
        return row.word === entry.word && row.heading === entry.heading;
      });

      const payload = {
        edition: entry.edition,
        word: entry.word,
        lookupKey: entry.lookupKey,
        heading: entry.heading,
        entryText: entry.entryText,
        sourceTable: entry.sourceTable,
        sourceId: entry.sourceId,
        length: entry.length,
        pronounce: entry.pronounce,
        updatedAt: now,
      };

      if (matching) {
        await ctx.db.patch(matching._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("dictionaryEntries", payload);
        inserted += 1;
      }
    }

    return { ok: true, inserted, updated };
  },
});
