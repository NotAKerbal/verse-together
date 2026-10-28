/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as annotationRules from "../annotationRules.js";
import type * as annotations from "../annotations.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as authEnvironment from "../authEnvironment.js";
import type * as authMigration from "../authMigration.js";
import type * as authProxy from "../authProxy.js";
import type * as authRateLimit from "../authRateLimit.js";
import type * as cache from "../cache.js";
import type * as chapterInsights from "../chapterInsights.js";
import type * as crons from "../crons.js";
import type * as feedCache from "../feedCache.js";
import type * as feedEpisodes from "../feedEpisodes.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as markValidators from "../markValidators.js";
import type * as nativeAuth from "../nativeAuth.js";
import type * as nativeAuthRules from "../nativeAuthRules.js";
import type * as nativeSync from "../nativeSync.js";
import type * as nativeSignIn from "../nativeSignIn.js";
import type * as nativeSignInPlugin from "../nativeSignInPlugin.js";
import type * as noteFolders from "../noteFolders.js";
import type * as noteJournal from "../noteJournal.js";
import type * as ownership from "../ownership.js";
import type * as preferences from "../preferences.js";
import type * as readingPlans from "../readingPlans.js";
import type * as readingProgress from "../readingProgress.js";
import type * as resources from "../resources.js";
import type * as social from "../social.js";
import type * as testerSignupRules from "../testerSignupRules.js";
import type * as testerSignups from "../testerSignups.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  annotationRules: typeof annotationRules;
  annotations: typeof annotations;
  auth: typeof auth;
  authEmail: typeof authEmail;
  authEnvironment: typeof authEnvironment;
  authMigration: typeof authMigration;
  authProxy: typeof authProxy;
  authRateLimit: typeof authRateLimit;
  cache: typeof cache;
  chapterInsights: typeof chapterInsights;
  crons: typeof crons;
  feedCache: typeof feedCache;
  feedEpisodes: typeof feedEpisodes;
  feedback: typeof feedback;
  http: typeof http;
  insights: typeof insights;
  markValidators: typeof markValidators;
  nativeAuth: typeof nativeAuth;
  nativeAuthRules: typeof nativeAuthRules;
  nativeSync: typeof nativeSync;
  nativeSignIn: typeof nativeSignIn;
  nativeSignInPlugin: typeof nativeSignInPlugin;
  noteFolders: typeof noteFolders;
  noteJournal: typeof noteJournal;
  ownership: typeof ownership;
  preferences: typeof preferences;
  readingPlans: typeof readingPlans;
  readingProgress: typeof readingProgress;
  resources: typeof resources;
  social: typeof social;
  testerSignupRules: typeof testerSignupRules;
  testerSignups: typeof testerSignups;
  users: typeof users;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
