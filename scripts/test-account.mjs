export const TEST_ACCOUNT = {
  name: "Local Tester",
  email: "tester@versetogether.test",
  password: "verse-local-tester",
};

async function post(fetchImpl, url, origin, body, cookie) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const setCookies = response.headers?.getSetCookie?.() ?? [];
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
    cookie: setCookies.map((value) => value.split(";")[0]).join("; "),
  };
}

async function signOut(fetchImpl, authUrl, origin, cookie) {
  if (cookie) await post(fetchImpl, `${authUrl}/api/auth/sign-out`, origin, {}, cookie);
}

export async function ensureTestAccount({ authUrl, origin, account = TEST_ACCOUNT, fetchImpl = fetch }) {
  const signIn = await post(fetchImpl, `${authUrl}/api/auth/sign-in/email`, origin, {
    email: account.email,
    password: account.password,
  });
  if (signIn.ok) {
    await signOut(fetchImpl, authUrl, origin, signIn.cookie);
    return "existing";
  }
  if (signIn.status === 404) {
    throw new Error("Email and password sign-in is off on this backend. Set AUTH_EMAIL_PASSWORD_ENABLED=true on it.");
  }
  if (signIn.status !== 401) {
    throw new Error(`Signing in as the test account failed (${signIn.status}): ${signIn.text}`);
  }
  const signUp = await post(fetchImpl, `${authUrl}/api/auth/sign-up/email`, origin, account);
  if (signUp.ok) {
    await signOut(fetchImpl, authUrl, origin, signUp.cookie);
    return "created";
  }
  if (signUp.text.includes("USER_ALREADY_EXISTS")) {
    throw new Error(`${account.email} already exists on this backend with a different password.`);
  }
  throw new Error(`Creating the test account failed (${signUp.status}): ${signUp.text}`);
}
