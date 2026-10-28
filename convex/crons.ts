// @ts-nocheck
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("sweep stale citation cache", { hourUTC: 6, minuteUTC: 0 }, internal.cache.sweepStaleCitations, {});
// Expired native sign-in handoffs (convex/nativeSignIn.ts), and sessions issued for codes nobody redeemed.
crons.interval("sweep native sign-in handoffs", { minutes: 15 }, internal.nativeSignIn.sweepExpired, {});

export default crons;
