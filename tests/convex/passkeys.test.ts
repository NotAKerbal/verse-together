import { Buffer } from "node:buffer";
import { encodeCBOR, type CBORType } from "@levischuck/tiny-cbor";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { components } from "../../convex/_generated/api";
import betterAuthTest from "./betterAuth";

const modules = import.meta.glob("../../convex/**/*.ts");
const ORIGIN = "http://localhost:3199";
const b64 = (value: Uint8Array) => Buffer.from(value).toString("base64url");
const bytes = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));
const join = (...values: Uint8Array[]) => new Uint8Array(Buffer.concat(values));
const hash = async (value: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(value)));

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;
function call(t: T, path: string, cookie = "", body?: unknown) {
  return t.fetch(`/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: ORIGIN, cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookies = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
async function user(t: T, email = "reader@example.com") {
  const response = await call(t, "/sign-up/email", "", { name: "Reader", email, password: "correct-horse-battery" });
  expect(response.status).toBe(200);
  return cookies(response);
}

async function register(t: T, cookie: string, origin = ORIGIN) {
  const options = await call(t, "/passkey/generate-register-options", cookie);
  expect(options.status).toBe(200);
  const data = await options.json();
  expect(data.rp).toEqual({ id: "localhost", name: "Verse Together" });
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const publicKey = encodeCBOR(new Map<number, CBORType>([[1, 2], [3, -7], [-1, 1], [-2, bytes(jwk.x!)], [-3, bytes(jwk.y!)]]));
  const id = crypto.getRandomValues(new Uint8Array(32));
  const authData = join(await hash(new TextEncoder().encode("localhost")), new Uint8Array([0x45, 0, 0, 0, 0]), new Uint8Array(16), new Uint8Array([0, id.length]), id, publicKey);
  const clientData = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: data.challenge, origin }));
  const attestation = encodeCBOR(new Map<string, CBORType>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
  const response = await call(t, "/passkey/verify-registration", `${cookie}; ${cookies(options)}`, {
    name: "My security key",
    response: { id: b64(id), rawId: b64(id), type: "public-key", response: { clientDataJSON: b64(clientData), attestationObject: b64(attestation), transports: ["usb"] }, clientExtensionResults: {} },
  });
  return { response, pair, id };
}

async function assertion(t: T, pair: CryptoKeyPair, id: Uint8Array, origin = ORIGIN) {
  const options = await call(t, "/passkey/generate-authenticate-options");
  expect(options.status).toBe(200);
  const { challenge } = await options.json();
  const clientData = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
  const authData = join(await hash(new TextEncoder().encode("localhost")), new Uint8Array([5, 0, 0, 0, 1]));
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, join(authData, await hash(clientData))));
  const integer = (value: Uint8Array) => {
    let start = 0;
    while (value[start] === 0 && start < value.length - 1) start++;
    const n = value.slice(start);
    const padded = n[0] & 0x80 ? join(new Uint8Array([0]), n) : n;
    return join(new Uint8Array([2, padded.length]), padded);
  };
  const values = join(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  const signature = join(new Uint8Array([0x30, values.length]), values);
  return {
    cookie: cookies(options),
    body: { response: { id: b64(id), rawId: b64(id), type: "public-key", response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData), signature: b64(signature) }, clientExtensionResults: {} } },
  };
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", ORIGIN);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("AUTH_EMAIL_FROM", undefined);
});
afterEach(() => vi.unstubAllEnvs());

test("registers a real credential, signs in without a password, and rejects replay", async () => {
  const t = setup();
  const cookie = await user(t);
  const { response, pair, id } = await register(t, cookie);
  expect(response.status).toBe(200);
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", undefined);
  const signed = await assertion(t, pair, id);
  const login = await call(t, "/passkey/verify-authentication", signed.cookie, signed.body);
  expect(login.status).toBe(200);
  expect((await login.json()).user.email).toBe("reader@example.com");
  expect(cookies(login)).toContain("session_token=");
  const replay = await call(t, "/passkey/verify-authentication", signed.cookie, signed.body);
  expect(replay.status).not.toBe(200);
}, 20000);

test("registration needs a session and verifies the configured origin", async () => {
  const t = setup();
  expect((await call(t, "/passkey/generate-register-options")).status).not.toBe(200);
  const cookie = await user(t);
  expect((await register(t, cookie, "https://attacker.example")).response.status).not.toBe(200);
  expect(await (await call(t, "/passkey/list-user-passkeys", cookie)).json()).toEqual([]);
});

test("passkeys belong to their owner and account deletion removes them", async () => {
  const t = setup();
  const cookie = await user(t);
  const { response } = await register(t, cookie);
  expect(response.status).toBe(200);
  const [passkey] = await (await call(t, "/passkey/list-user-passkeys", cookie)).json();
  const other = await user(t, "other@example.com");
  expect(await (await call(t, "/passkey/list-user-passkeys", other)).json()).toEqual([]);
  await call(t, "/passkey/delete-passkey", other, { id: passkey.id });
  expect((await (await call(t, "/passkey/list-user-passkeys", cookie)).json()).length).toBe(1);
  expect((await call(t, "/delete-user", cookie, {})).status).toBe(200);
  const signed = await call(t, "/passkey/list-user-passkeys", cookie);
  expect(signed.status).not.toBe(200);
  expect(await t.query(components.betterAuth.adapter.findOne, {
    model: "passkey", where: [{ field: "_id", value: passkey.id }],
  })).toBeNull();
});

test("rejects a signed assertion for another origin", async () => {
  const t = setup();
  const { pair, id, response } = await register(t, await user(t));
  expect(response.status).toBe(200);
  const signed = await assertion(t, pair, id, "https://attacker.example");
  expect((await call(t, "/passkey/verify-authentication", signed.cookie, signed.body)).status).not.toBe(200);
});

 test("the owner can remove a passkey and it cannot sign in afterward", async () => {
  const t = setup();
  const cookie = await user(t);
  const { response, pair, id } = await register(t, cookie);
  expect(response.status).toBe(200);
  const [passkey] = await (await call(t, "/passkey/list-user-passkeys", cookie)).json();
  expect((await call(t, "/passkey/delete-passkey", cookie, { id: passkey.id })).status).toBe(200);
  expect(await (await call(t, "/passkey/list-user-passkeys", cookie)).json()).toEqual([]);
  const signed = await assertion(t, pair, id);
  expect((await call(t, "/passkey/verify-authentication", signed.cookie, signed.body)).status).not.toBe(200);
});
