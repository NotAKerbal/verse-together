import "server-only";

import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";
import { fetchChapter } from "@/lib/openscripture";
import { createServerChapterFetcher } from "@/lib/serverChapterFetcher";

/**
 * fetchChapter for server code: bundled LDS chapters come straight from the local data (no Convex read, no HTTP
 * round trip to this app's own API); translations and chapters outside the bundle keep the remote fallbacks.
 * Volume aliases such as "dnc" are canonicalized first, so they read the bundle too.
 */
export const fetchChapterOnServer = createServerChapterFetcher(fetchChapter, getLocalLdsChapter);
