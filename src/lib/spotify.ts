export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyShow = {
  id: string;
  name: string;
  publisher: string;
  description: string;
  htmlDescription: string;
  languages: string[];
  totalEpisodes: number;
  mediaType: string;
  images: SpotifyImage[];
  externalUrl: string;
};

export type SpotifyEpisode = {
  id: string;
  name: string;
  description: string;
  htmlDescription: string;
  releaseDate: string;
  releaseDatePrecision: "year" | "month" | "day";
  releaseDateSortKey: string;
  durationMs: number;
  images: SpotifyImage[];
  externalUrl: string;
  isExternallyHosted: boolean;
  isPlayable: boolean;
};

export type SpotifyEpisodePage = {
  episodes: SpotifyEpisode[];
  nextOffset: number | null;
  total: number;
};

type SpotifyTokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_GRACE_MS = 60_000;
const REQUEST_RETRY_LIMIT = 3;
const BASE_RETRY_DELAY_MS = 750;

let tokenCache: SpotifyTokenCache = null;

function getSpotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "";
  return { clientId, clientSecret };
}

export function isSpotifyConfigured() {
  const { clientId, clientSecret } = getSpotifyCredentials();
  return Boolean(clientId && clientSecret);
}

function stripHtmlTags(input: string) {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getReleaseDateSortKey(value: string, precision: "year" | "month" | "day") {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (precision === "year") {
    return `${trimmed}-12-31`;
  }
  if (precision === "month") {
    return `${trimmed}-31`;
  }
  return trimmed;
}

async function readJsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const raw = await response.text();
  if (!response.ok) {
    const snippet = raw.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`${context} failed (${response.status}): ${snippet || "No response body"}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${context} returned invalid JSON`);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSpotifyJson<T>(url: string, accessToken: string, context: string, attempt = 0): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    next: { revalidate: 60 * 30 },
  });

  if ((response.status === 429 || response.status >= 500) && attempt < REQUEST_RETRY_LIMIT) {
    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
    const retryDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : BASE_RETRY_DELAY_MS * (attempt + 1);
    await delay(retryDelayMs);
    return await fetchSpotifyJson<T>(url, accessToken, context, attempt + 1);
  }

  return await readJsonOrThrow<T>(response, context);
}

async function getSpotifyAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_GRACE_MS) {
    return tokenCache.accessToken;
  }

  const { clientId, clientSecret } = getSpotifyCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are not configured");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  const payload = await readJsonOrThrow<{ access_token: string; expires_in: number }>(
    response,
    "Spotify token request"
  );

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

export async function fetchSpotifyShow(showId: string, market = "US"): Promise<SpotifyShow> {
  const accessToken = await getSpotifyAccessToken();
  const payload = await fetchSpotifyJson<{
    id: string;
    name: string;
    publisher?: string;
    description?: string;
    html_description?: string;
    languages?: string[];
    total_episodes?: number;
    media_type?: string;
    images?: Array<{ url?: string; height?: number | null; width?: number | null }>;
    external_urls?: { spotify?: string };
  }>(
    `${SPOTIFY_API_BASE}/shows/${encodeURIComponent(showId)}?market=${encodeURIComponent(market)}`,
    accessToken,
    `Spotify show ${showId}`
  );

  return {
    id: payload.id,
    name: payload.name,
    publisher: payload.publisher?.trim() || "Spotify",
    description: stripHtmlTags(payload.description || payload.html_description || ""),
    htmlDescription: payload.html_description?.trim() || "",
    languages: Array.isArray(payload.languages) ? payload.languages.filter(Boolean) : [],
    totalEpisodes: Number.isFinite(payload.total_episodes) ? payload.total_episodes ?? 0 : 0,
    mediaType: payload.media_type?.trim() || "audio",
    images: Array.isArray(payload.images)
      ? payload.images
          .filter((image) => typeof image?.url === "string" && image.url.length > 0)
          .map((image) => ({
            url: image.url as string,
            height: image.height ?? null,
            width: image.width ?? null,
          }))
      : [],
    externalUrl: payload.external_urls?.spotify?.trim() || `https://open.spotify.com/show/${payload.id}`,
  };
}

export async function fetchSpotifyShowEpisodesPage(
  showId: string,
  {
    market = "US",
    offset = 0,
    limit = 12,
  }: {
    market?: string;
    offset?: number;
    limit?: number;
  } = {}
): Promise<SpotifyEpisodePage> {
  const accessToken = await getSpotifyAccessToken();
  const payload = await fetchSpotifyJson<{
    items?: Array<{
      id: string;
      name: string;
      description?: string;
      html_description?: string;
      release_date?: string;
      release_date_precision?: "year" | "month" | "day";
      duration_ms?: number;
      images?: Array<{ url?: string; height?: number | null; width?: number | null }>;
      external_urls?: { spotify?: string };
      is_externally_hosted?: boolean;
      is_playable?: boolean;
    }>;
    total?: number;
    limit?: number;
  }>(
    `${SPOTIFY_API_BASE}/shows/${encodeURIComponent(showId)}/episodes?market=${encodeURIComponent(market)}&limit=${limit}&offset=${offset}`,
    accessToken,
    `Spotify show episodes ${showId}`
  );

  const pageItems = Array.isArray(payload.items) ? payload.items : [];
  const episodes = pageItems.map((episode) => {
    const releaseDatePrecision = episode.release_date_precision ?? "day";
    return {
      id: episode.id,
      name: episode.name,
      description: stripHtmlTags(episode.description || episode.html_description || ""),
      htmlDescription: episode.html_description?.trim() || "",
      releaseDate: episode.release_date?.trim() || "",
      releaseDatePrecision,
      releaseDateSortKey: getReleaseDateSortKey(episode.release_date || "", releaseDatePrecision),
      durationMs: Number.isFinite(episode.duration_ms) ? episode.duration_ms ?? 0 : 0,
      images: Array.isArray(episode.images)
        ? episode.images
            .filter((image) => typeof image?.url === "string" && image.url.length > 0)
            .map((image) => ({
              url: image.url as string,
              height: image.height ?? null,
              width: image.width ?? null,
            }))
        : [],
      externalUrl: episode.external_urls?.spotify?.trim() || `https://open.spotify.com/episode/${episode.id}`,
      isExternallyHosted: Boolean(episode.is_externally_hosted),
      isPlayable: Boolean(episode.is_playable ?? true),
    };
  });

  episodes.sort((left, right) => {
    const byDate = right.releaseDateSortKey.localeCompare(left.releaseDateSortKey);
    if (byDate !== 0) {
      return byDate;
    }
    return right.id.localeCompare(left.id);
  });

  const total = Number.isFinite(payload.total) ? payload.total ?? episodes.length : episodes.length;
  const nextOffset = offset + pageItems.length < total ? offset + pageItems.length : null;

  return {
    episodes,
    nextOffset,
    total,
  };
}
