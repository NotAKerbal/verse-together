import { createApi } from "@convex-dev/better-auth";
import { passkey } from "@better-auth/passkey";
import schema from "./schema";
import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

export const { create, findOne, findMany, updateOne, updateMany, deleteOne, deleteMany } = createApi(
  schema,
  () => ({ plugins: [passkey()] }),
);

export const deleteUserPasskeys = mutationGeneric({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query("passkey").withIndex("userId", (q) => q.eq("userId", userId)).take(100);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return rows.length < 100;
  },
});
