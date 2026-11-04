import { SiteAuth, SiteAuthError, publishSiteAuth, resetSiteAuth } from "../src/account/siteAuth";

const SITE = "https://www.versetogether.org";

type Call = { url: string; authorization: string | null; signal: AbortSignal | undefined; body: string };
type Reply = { status: number; body: unknown } | "hang";

let calls: Call[];
let replies: Reply[];
let pending: Array<{ resolve: (response: Response) => void; call: Call }>;

function respond(reply: { status: number; body: unknown }) {
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
}

function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const call: Call = { url: String(input), authorization: headers.authorization ?? null, signal: init?.signal ?? undefined, body: String(init?.body) };
  calls.push(call);
  const reply = replies.shift() ?? { status: 404, body: { error: "Not found" } };
  if (reply === "hang") {
    return new Promise<Response>((resolve, reject) => {
      pending.push({ resolve, call });
      call.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
    });
  }
  return Promise.resolve(respond(reply));
}

let storedSession: string | null;
let tokens: string[];

function openAccount(owner: string, { token = async () => `jwt-for-${owner}` }: { token?: () => Promise<string | null> } = {}) {
  storedSession = `session-${owner}`;
  const auth = new SiteAuth(
    owner,
    SITE,
    async () => {
      const value = await token();
      if (value) tokens.push(value);
      return value;
    },
    () => storedSession,
    fakeFetch as typeof fetch
  );
  return { auth, close: publishSiteAuth(auth) };
}

beforeEach(() => {
  calls = [];
  replies = [];
  pending = [];
  tokens = [];
  storedSession = null;
  resetSiteAuth();
  jest.spyOn(globalThis, "fetch").mockImplementation(fakeFetch as typeof fetch);
});

afterEach(() => {
  jest.restoreAllMocks();
  resetSiteAuth();
});

describe("SiteAuth", () => {
  it("an answer that arrives after another session was stored is refused, even before the account is closed", async () => {
    const { auth } = openAccount("owner-A");
    replies = ["hang"];
    const sent = auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    await Promise.resolve();
    await Promise.resolve();
    storedSession = "session-someone-else";
    pending[0].resolve(respond({ status: 200, body: {} }));
    await expect(sent).rejects.toEqual(new SiteAuthError("changed"));
  });

  it("sends the account's token only to its own site's API", async () => {
    const { auth } = openAccount("owner-A");
    for (const path of ["https://evil.example/api/insights/chapter", "//evil.example/api/x", "/api/../auth/x", "/api", "/other", "/api/insights/chapter?x=1"]) {
      await expect(auth.fetch(path, { method: "POST", body: "{}" })).rejects.toThrow("Only the site's own API");
    }
    expect(tokens).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("fetches a fresh token for each request and none once closed", async () => {
    const { auth, close } = openAccount("owner-A");
    replies = [{ status: 200, body: {} }, { status: 200, body: {} }];
    await auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    await auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    expect(tokens).toHaveLength(2);
    close();
    await expect(auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" })).rejects.toEqual(new SiteAuthError("changed"));
    expect(tokens).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});
