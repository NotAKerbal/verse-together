// The contract between the Next.js auth proxy (src/app/api/auth/[...all]/route.ts) and the Better Auth
// routes on the Convex deployment for passing the caller's IP address, which Better Auth uses to key
// rate limits and to record on sessions.
//
// Trust boundary: Convex HTTP actions cannot see the socket address, and the Convex site URL is public,
// so any forwarded IP header that arrives there could have been written by the caller. The Next server
// therefore resolves the client IP from a header its hosting edge overwrites (see
// resolveTrustedClientIp), and signs it with AUTH_PROXY_SECRET, a secret shared only by the Next server
// and the Convex deployment. Convex strips the IP header unless the signature checks out (see
// withVerifiedClientIp), and Better Auth is told to read only that header. Requests without a valid
// signature (callers hitting the Convex site directly, or a misconfigured proxy) carry no IP and share
// one rate-limit bucket per path, so they can't spend a real visitor's allowance.
//
// Pure (Web Crypto only, no Convex or Node imports) so both runtimes and the tests can use it.

export const CLIENT_IP_HEADER = "x-verse-client-ip";
export const CLIENT_IP_TIMESTAMP_HEADER = "x-verse-client-ip-ts";
export const CLIENT_IP_SIGNATURE_HEADER = "x-verse-client-ip-sig";
const PROXY_HEADERS = [CLIENT_IP_HEADER, CLIENT_IP_TIMESTAMP_HEADER, CLIENT_IP_SIGNATURE_HEADER];

/** How far a signature's timestamp may be from the verifier's clock, either way. */
export const MAX_SIGNATURE_SKEW_MS = 60_000;
export const MIN_PROXY_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/** AUTH_PROXY_SECRET, or null when it is unset or too short to be a real secret. */
export function readProxySecret(env: Env = process.env): string | null {
  const secret = env.AUTH_PROXY_SECRET?.trim();
  return secret && secret.length >= MIN_PROXY_SECRET_LENGTH ? secret : null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidIp(value: string): boolean {
  if (value.length === 0 || value.length > 45) return false;
  if (IPV4.test(value)) return true;
  if (!value.includes(":") || !/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  // The WHATWG URL parser validates IPv6 literals the same way in Node, browsers, and Convex.
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

/**
 * The client IP as reported by the edge in front of the Next server, or null when there is no header
 * the edge is known to overwrite. AUTH_CLIENT_IP_HEADER names that header explicitly (for example
 * "cf-connecting-ip" behind Cloudflare); on Vercel, which overwrites "x-real-ip" with the connecting
 * address, it defaults to that. The value must be a single address: a comma-separated chain means
 * something upstream appended to a client-supplied value, so it is not trusted.
 */
export function resolveTrustedClientIp(headers: Headers, env: Env = process.env): string | null {
  const configured = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase();
  const headerName = configured || (env.VERCEL === "1" ? "x-real-ip" : null);
  if (!headerName) return null;
  const value = headers.get(headerName)?.trim();
  if (!value || value.includes(",")) return null;
  return isValidIp(value) ? value : null;
}

function signedPayload(ip: string, timestamp: string, method: string, pathname: string): string {
  return ["verse-auth-ip-v1", timestamp, method.toUpperCase(), pathname, ip].join("\n");
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Headers the proxy adds so Convex can trust `ip` for this method and path for about a minute. */
export async function signClientIp(options: {
  secret: string;
  ip: string;
  method: string;
  pathname: string;
  now?: number;
}): Promise<Record<string, string>> {
  const timestamp = String(options.now ?? Date.now());
  const key = await hmacKey(options.secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload(options.ip, timestamp, options.method, options.pathname))
  );
  return {
    [CLIENT_IP_HEADER]: options.ip,
    [CLIENT_IP_TIMESTAMP_HEADER]: timestamp,
    [CLIENT_IP_SIGNATURE_HEADER]: toHex(signature),
  };
}

/** The signed client IP on `headers`, or null when it is missing, stale, malformed, or forged. */
export async function verifyClientIp(options: {
  secret: string;
  headers: Headers;
  method: string;
  pathname: string;
  now?: number;
}): Promise<string | null> {
  const ip = options.headers.get(CLIENT_IP_HEADER);
  const timestamp = options.headers.get(CLIENT_IP_TIMESTAMP_HEADER);
  const signature = fromHex(options.headers.get(CLIENT_IP_SIGNATURE_HEADER) ?? "");
  if (!ip || !timestamp || !signature || !isValidIp(ip) || !/^\d{1,16}$/.test(timestamp)) return null;
  if (Math.abs((options.now ?? Date.now()) - Number(timestamp)) > MAX_SIGNATURE_SKEW_MS) return null;
  const key = await hmacKey(options.secret, "verify");
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(signedPayload(ip, timestamp, options.method, options.pathname))
  );
  return valid ? ip : null;
}

/** A copy of `headers` with every proxy header removed. */
export function withoutProxyHeaders(headers: Headers): Headers {
  const copy = new Headers(headers);
  for (const name of PROXY_HEADERS) copy.delete(name);
  return copy;
}

/**
 * Convex side: the request Better Auth should see. CLIENT_IP_HEADER survives only when the proxy's
 * signature verifies; the timestamp and signature headers never reach Better Auth.
 */
export async function withVerifiedClientIp(request: Request, secret: string | null, now?: number): Promise<Request> {
  const ip = secret
    ? await verifyClientIp({ secret, headers: request.headers, method: request.method, pathname: new URL(request.url).pathname, now })
    : null;
  const headers = withoutProxyHeaders(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(request, { headers });
}
