// @ts-nocheck
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("sweep stale citation cache", { hourUTC: 6, minuteUTC: 0 }, internal.cache.sweepStaleCitations, {});

export default crons;
