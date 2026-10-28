// The signed-in account, for the whole app. Signed out (the default), nothing here touches the network: no Convex
// connection and no session check run until a session cookie is in secure storage. With one, a Convex client is
// opened for that session alone (and closed when it ends, so nothing cached for one account outlives it), and the
// account is shown as signed in only once Convex has accepted the session and the app user is provisioned and still
// recognised: the web's rule (src/lib/auth.tsx).
//
// Signed in, the study screens read and write the account's own study (journal, verse notes and marks, guide
// annotations), through a per-account cache and outbox on the device (src/storage/accountStudy.ts) kept in step by
// StudySync while the session is verified. This device's own study is left as it was and shows again after signing
// out; it reaches the account only through the explicit copy (Settings). Which study the screens use is published
// here as the study session (src/storage/studySession.ts). An account whose deletion stopped
// partway (the app user is already gone; see convex/accountDeletion.ts) is shown as "deletion-pending": its owner can
// finish deleting it or sign out, and nothing else, so it is never provisioned or written to again.
//
// Signing out and deleting the account end any Google sign-in still pending (googleSignIn.ts), so a return from it
// that arrives afterwards (or an exchange still on its way) can't sign the device back in. Storage failures become
// notices, never rejections.

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { deviceStudy } from "../storage/study";
import { accountStore, purgeAccountCache, readLastOwner, readRecordedOwner, writeLastOwner } from "../storage/accountStudy";
import { sessionBinding } from "./sessionBinding";
import { setStudySession, type StudySession } from "../storage/studySession";
import { StudySync, convexSyncClient } from "./studySync";
import { storage as studyStorage } from "../storage/kv";
import { accountApi, type PendingDeletion, type Viewer } from "./api";
import { cookieJar, createNativeAuthClient, hasStoredSession, type NativeAuthClient, type SecureStorage } from "./client";
import { readAccountConfig, type AccountConfig } from "./config";
import { copyDeviceStudy, releaseAccountCopies, type CopyResult } from "./guestCopy";
import {
  OFFLINE_MESSAGE,
  base64Url,
  cancelPendingSignIn,
  completeSignInReturn,
  signInWithGoogle,
  type AuthBrowser,
  type ReturnParams,
  type SignInCrypto,
  type SignInOutcome,
} from "./googleSignIn";

// The provider's AuthClient type infers `never` for session data once the Expo plugin is in the client's plugin
// list; the client is the one its own docs pass for Expo, so only the static type is narrowed here.
type ConvexAuthClient = ComponentProps<typeof ConvexBetterAuthProvider>["authClient"];

export type AccountRuntime = {
  config: AccountConfig;
  authClient: NativeAuthClient;
  storage: SecureStorage;
  browser: AuthBrowser;
  crypto: SignInCrypto;
  /** The HTTPS client for the sign-in code exchange (global fetch by default). */
  fetch?: typeof fetch;
  createConvexClient: (url: string) => ConvexReactClient;
};

export type AccountUser = { appUserId: string; email: string | null; name: string | null };

export type AccountStatus =
  /** This build has no sign-in configuration (see config.ts). */
  | "unavailable"
  | "signed-out"
  /** A saved session is being checked. */
  | "checking"
  | "signed-in"
  /** A saved session, but Verse Together can't be reached. */
  | "offline"
  /** A saved session the server or Convex didn't accept, or an account that couldn't be loaded. */
  | "error"
  /** Deleting this account stopped partway: it can only be finished (or signed out of). */
  | "deletion-pending";

export type DeleteOutcome = { ok: true } | { ok: false; reauthenticate: boolean; message: string };

type AccountContextValue = {
  status: AccountStatus;
  user: AccountUser | null;
  /** The saved session's email, shown while it's being checked or can't be reached. */
  sessionEmail: string | null;
  /** The latest sign-in, sign-out or session notice, for Settings. */
  notice: { tone: "muted" | "warning"; text: string } | null;
  signingIn: boolean;
  signIn: () => Promise<SignInOutcome | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<DeleteOutcome>;
  copyStudy: () => Promise<CopyResult>;
  /** For the auth-callback route; null when the link isn't this device's sign-in. */
  completeReturn: (params: ReturnParams) => Promise<SignInOutcome> | null;
  clearNotice: () => void;
  /** Checks a saved session again (after being offline or an error). */
  retry: () => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

const SIGNED_OUT: Pick<AccountContextValue, "status" | "user" | "sessionEmail"> = { status: "signed-out", user: null, sessionEmail: null };

const SESSION_ENDED = { tone: "warning", text: "Your session ended. Sign in again to use your account. Your study on this device is still here." } as const;
/** Secure storage refused to forget the session; it is forgotten for this run of the app either way. */
const NOT_FORGOTTEN = "This device's saved sign-in couldn't be removed from secure storage. Restart the app; if you're still signed in, sign out again.";
/** Neither store would record that a pending Google sign-in ended; it is ended for this run of the app either way. */
const PENDING_NOT_RECORDED =
  "This device couldn't record that the Google sign-in in progress was stopped. If you find yourself signed in after restarting the app, sign out again.";

/** Convex queues calls while disconnected; an account action should say so instead of waiting forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for the connection")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const ACCOUNT_CALL_TIMEOUT_MS = 20_000;
/** How long a session may stay unverified by Convex before it's reported (src/lib/auth.tsx uses the same). */
const VERIFY_GRACE_MS = 8_000;

let defaultRuntime: AccountRuntime | null | undefined;

/** The real runtime: SecureStore, the system auth browser, and this build's public URLs. */
function loadDefaultRuntime(): AccountRuntime | null {
  if (defaultRuntime !== undefined) return defaultRuntime;
  const config = readAccountConfig();
  if (!config) return (defaultRuntime = null);
  // Required here so a build (or test) without sign-in never loads the native modules.
  const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
  const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
  // Hermes has no Web Crypto: the attempt id and verifier come from the platform's secure random generator, and the
  // S256 challenge from its SHA-256.
  const Crypto = require("expo-crypto") as typeof import("expo-crypto");
  const crypto: SignInCrypto = {
    randomToken: () => base64Url(Crypto.getRandomBytes(32)),
    s256: async (verifier) =>
      base64Url(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(verifier, (char) => char.charCodeAt(0))))),
  };
  const storage: SecureStorage = {
    getItem: (key) => SecureStore.getItem(key),
    setItem: (key, value) => SecureStore.setItem(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  };
  defaultRuntime = {
    config,
    authClient: createNativeAuthClient(config, storage),
    storage,
    browser: WebBrowser,
    crypto,
    createConvexClient: (url) => new ConvexReactClient(url, { unsavedChangesWarning: false }),
  };
  return defaultRuntime;
}

type WatchedState = Pick<AccountContextValue, "status" | "user" | "sessionEmail"> & { stale?: boolean; deletion?: PendingDeletion };

type Verdict = "pending" | "live" | "none" | "unreachable";

/**
 * Follows the saved session through Better Auth and Convex. Mounted only while there is one. Whether the session
 * is still good is decided by this watcher's own server check (re-run on `checkKey`), never by session state left
 * over from before it mounted.
 */
function SessionWatcher({ authClient, checkKey, onState }: { authClient: NativeAuthClient; checkKey: number; onState: (state: WatchedState) => void }) {
  const { data, error, isPending } = authClient.useSession();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const ensureCurrentUser = useMutation(accountApi.ensureCurrentUser);
  const sessionId = data?.session?.id ?? null;
  const [verdict, setVerdict] = useState<Verdict>("pending");
  const [provisioned, setProvisioned] = useState<{ sessionId: string; viewer: Viewer | null; error: string | null } | null>(null);
  const [unverifiedSince, setUnverifiedSince] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVerdict("pending");
    authClient
      .getSession()
      .then(
        ({ data: checked, error: failed }) =>
          checked?.session ? "live" : failed && (failed as { status?: number }).status !== 401 ? "unreachable" : "none",
        () => "unreachable" as const,
      )
      .then((next: Verdict) => {
        if (!cancelled) setVerdict(next);
      });
    return () => {
      cancelled = true;
    };
  }, [authClient, checkKey]);

  // A later successful session refresh (the plugin refetches when the app returns online or to the foreground).
  useEffect(() => {
    if (verdict === "unreachable" && data?.session && !error && !isPending) setVerdict("live");
  }, [verdict, data, error, isPending]);

  // Asked once Convex accepts the session, before provisioning: an account being deleted is never recreated.
  const accepted = verdict === "live" && !!sessionId && isAuthenticated;
  const deletion = useQuery(accountApi.pendingDeletion, accepted ? {} : "skip");

  useEffect(() => {
    if (!accepted || !sessionId || deletion !== null || provisioned?.sessionId === sessionId) return;
    let cancelled = false;
    ensureCurrentUser({}).then(
      (viewer) => {
        if (!cancelled) setProvisioned({ sessionId, viewer, error: null });
      },
      () => {
        if (!cancelled) setProvisioned({ sessionId, viewer: null, error: "We couldn't load your account. Try again, or sign out and back in." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accepted, sessionId, deletion, provisioned?.sessionId, ensureCurrentUser]);

  const current = provisioned?.sessionId === sessionId ? provisioned : null;
  const viewer = isAuthenticated ? (current?.viewer ?? null) : null;
  // After provisioning: the app user and any deletion of it, from one read. Two separate subscriptions (the viewer and
  // the pending deletion) can deliver a deletion's start in either order, and seeing the viewer gone first must not
  // forget a session whose owner still has a deletion to finish.
  const live = useQuery(accountApi.accountStatus, viewer ? {} : "skip");

  // Convex refusing a session for a while is an error, not "still checking".
  const unverified = verdict === "live" && !!sessionId && !convexLoading && !isAuthenticated;
  useEffect(() => {
    if (!unverified || !sessionId) return;
    const timer = setTimeout(() => setUnverifiedSince(sessionId), VERIFY_GRACE_MS);
    return () => {
      clearTimeout(timer);
      setUnverifiedSince(null);
    };
  }, [unverified, sessionId]);

  const email = data?.user?.email ?? null;
  const name = data?.user?.name ?? null;
  const unreachable = !!error && (error as { status?: number }).status !== 401;
  const state = useMemo<WatchedState>(() => {
    if (verdict === "none") return { ...SIGNED_OUT, stale: true };
    if (verdict === "unreachable") return { status: "offline", user: null, sessionEmail: email };
    if (verdict === "pending" || !sessionId) return { status: "checking", user: null, sessionEmail: email };
    // Checked before the viewer: starting a deletion removes the app user and records the deletion in one step.
    if (accepted && deletion) return { status: "deletion-pending", user: null, sessionEmail: email, deletion };
    if (viewer && live?.deletion) return { status: "deletion-pending", user: null, sessionEmail: email, deletion: live.deletion };
    // Signed out elsewhere, or the account was deleted: the server no longer knows this session's user (and no
    // deletion of it is waiting to be finished, in the same read).
    if (viewer && (live === null || (live && !live.viewer))) return { ...SIGNED_OUT, stale: true };
    if (viewer) {
      const account = live?.viewer ?? viewer;
      return { status: "signed-in", user: { appUserId: account.appUserId, email, name: account.displayName ?? name }, sessionEmail: email };
    }
    if (unreachable) return { status: "offline", user: null, sessionEmail: email };
    if (current?.error) return { status: "error", user: null, sessionEmail: email };
    if (unverified && unverifiedSince === sessionId) return { status: "error", user: null, sessionEmail: email };
    return { status: "checking", user: null, sessionEmail: email };
  }, [verdict, sessionId, email, name, accepted, deletion, viewer, live, unreachable, current?.error, unverified, unverifiedSince]);

  useEffect(() => onState(state), [state, onState]);
  return null;
}

export function AccountProvider({ children, runtime: injected }: { children: ReactNode; runtime?: AccountRuntime | null }) {
  const runtime = useMemo(() => (injected === undefined ? loadDefaultRuntime() : injected), [injected]);
  const [hasSession, setHasSession] = useState(() => (runtime ? hasStoredSession(runtime.storage) : false));
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [watched, setWatched] = useState<WatchedState | null>(null);
  const [notice, setNotice] = useState<AccountContextValue["notice"]>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [checkKey, setCheckKey] = useState(0);
  // Bumped whenever a sign-in stores a session, including one made while already signed in (signing in again to
  // delete, possibly with another Google account): the Convex client and the token cache in ConvexBetterAuthProvider
  // then start over, so Convex never keeps acting as the previous session.
  const [generation, setGeneration] = useState(0);
  const ownerRef = useRef<string | null>(null);
  const syncRef = useRef<StudySync | null>(null);
  // The account this very saved session was last verified as (kept on the device with the session's fingerprint), so
  // its study shows offline. Any other session, including one stored by a sign-in that hasn't been checked yet, gets none.
  const [lastOwner, setLastOwner] = useState<string | null>(() => (runtime && hasStoredSession(runtime.storage) ? readLastOwner(sessionBinding(runtime.storage)) : null));
  // The latest signIn call; an earlier one that settles later (after signing out) changes nothing on screen.
  const signInRun = useRef(0);
  const endingSession = useRef(false);

  // One Convex client per saved session, closed with it.
  useEffect(() => {
    if (!runtime || !hasSession) return;
    void generation;
    const next = runtime.createConvexClient(runtime.config.convexUrl);
    setClient(next);
    return () => {
      setClient(null);
      setWatched(null);
      void next.close();
    };
  }, [runtime, hasSession, generation]);

  /** Forgets the session on this device. Never rejects: false when secure storage still holds it. */
  const forgetSession = useCallback(async ({ owner = ownerRef.current ?? readRecordedOwner(), deleted = false }: { owner?: string | null; deleted?: boolean } = {}): Promise<boolean> => {
    ownerRef.current = null;
    syncRef.current?.dispose();
    setWatched(null);
    setStudySession({ mode: "device" });
    // The account's cached study leaves the device with its session. Changes it hasn't received yet stay, for that
    // account only (sent if it signs in here again), unless the account itself was deleted.
    if (owner) purgeAccountCache(owner, { keepOutbox: !deleted });
    writeLastOwner(null);
    setLastOwner(null);
    setHasSession(false);
    if (!runtime) return true;
    try {
      await cookieJar(runtime.storage).clear();
      return true;
    } catch {
      return false;
    }
  }, [runtime]);

  const onWatched = useCallback(
    (state: WatchedState) => {
      if (state.stale) {
        setNotice(SESSION_ENDED);
        void forgetSession().then((forgotten) => {
          if (!forgotten) setNotice({ tone: "warning", text: NOT_FORGOTTEN });
        });
        return;
      }
      setWatched(state);
    },
    [forgetSession],
  );

  const base = !runtime ? { status: "unavailable" as const, user: null, sessionEmail: null } : !hasSession ? SIGNED_OUT : (watched ?? { status: "checking" as const, user: null, sessionEmail: null });
  const user = base.status === "signed-in" ? base.user : null;
  useEffect(() => {
    ownerRef.current = user?.appUserId ?? null;
  }, [user?.appUserId]);

  const sessionStored = useCallback(() => {
    // Invalidate the old owner immediately, before another callback or render can use it.
    syncRef.current?.dispose();
    ownerRef.current = null;
    setWatched(null);
    setClient(null);
    setStudySession({ mode: "blocked", reason: "checking" });
    // A new session may be another account's: nothing of the previous one shows until this one is checked.
    writeLastOwner(null);
    setLastOwner(null);
    setHasSession(true);
    setGeneration((value) => value + 1);
    runtime?.authClient.$store.notify("$sessionSignal");
  }, [runtime]);

  const applyOutcome = useCallback((outcome: SignInOutcome) => {
    // Ended by signing out or deleting the account, which said so already.
    if (outcome.kind === "abandoned") return;
    if (outcome.kind === "signed-in") setNotice(null);
    else if (outcome.kind === "cancelled" && outcome.unrecorded) setNotice({ tone: "warning", text: `Sign-in was cancelled. ${PENDING_NOT_RECORDED}` });
    else if (outcome.kind === "cancelled") setNotice({ tone: "muted", text: "Sign-in was cancelled. Nothing changed." });
    else setNotice({ tone: "warning", text: outcome.message });
  }, []);

  const signIn = useCallback(async (): Promise<SignInOutcome | null> => {
    if (!runtime) return null;
    if (endingSession.current) {
      const outcome = { kind: "error", message: "Sign-out is still finishing. Try signing in again in a moment." } as const;
      applyOutcome(outcome);
      return outcome;
    }
    const run = ++signInRun.current;
    setSigningIn(true);
    setNotice(null);
    let outcome: SignInOutcome;
    try {
      outcome = await signInWithGoogle({
        authClient: runtime.authClient,
        authBaseURL: runtime.config.authBaseURL,
        storage: runtime.storage,
        browser: runtime.browser,
        crypto: runtime.crypto,
        fetch: runtime.fetch,
        onSessionStored: sessionStored,
      });
    } catch {
      outcome = { kind: "error", message: "Google sign-in couldn't start. Try again in a moment." };
    }
    if (signInRun.current !== run) return { kind: "abandoned" };
    setSigningIn(false);
    applyOutcome(outcome);
    return outcome;
  }, [runtime, sessionStored, applyOutcome]);

  /**
   * Ends any pending Google sign-in, so its return can't sign this device in again (signing out, deleting). Resolves to
   * whether that was recorded on the device too (so it holds after a restart); never rejects.
   */
  const endPendingSignIn = useCallback((): Promise<boolean> => {
    signInRun.current += 1;
    setSigningIn(false);
    return runtime ? cancelPendingSignIn({ storage: runtime.storage, browser: runtime.browser }) : Promise.resolve(true);
  }, [runtime]);

  const completeReturn = useCallback(
    (params: ReturnParams) => {
      if (!runtime) return null;
      const completion = completeSignInReturn(params, {
        authBaseURL: runtime.config.authBaseURL,
        storage: runtime.storage,
        fetch: runtime.fetch,
        onSessionStored: sessionStored,
      });
      void completion?.then(applyOutcome);
      return completion;
    },
    [runtime, sessionStored, applyOutcome],
  );

  const signOut = useCallback(async () => {
    if (!runtime || endingSession.current) return;
    endingSession.current = true;
    const owner = ownerRef.current ?? readRecordedOwner();
    ownerRef.current = null;
    // First, before anything is awaited: a sign-in return arriving from now on is ignored.
    const ended = endPendingSignIn();
    let confirmed = false;
    try {
      // The Expo plugin forgets the cookie as the request goes out, so this device is signed out either way.
      const request = runtime.authClient.signOut();
      // A timed-out request may still run the auth plugin's cookie cleanup later. Don't permit a new sign-in
      // until that cleanup has actually settled (restart is safe if the request never completes).
      void request.then(() => { endingSession.current = false; }, () => { endingSession.current = false; });
      // Capture the request's cookie first; then leave account study immediately, even if the network hangs.
      syncRef.current?.dispose();
      setWatched(null);
      setHasSession(false);
      setStudySession({ mode: "device" });
      const result = await withTimeout(request, ACCOUNT_CALL_TIMEOUT_MS);
      confirmed = !result.error;
    } catch {}
    const recorded = await ended;
    const forgotten = await forgetSession({ owner });
    setNotice(
      !forgotten
        ? { tone: "warning", text: NOT_FORGOTTEN }
        : !recorded
          ? { tone: "warning", text: `Signed out. ${PENDING_NOT_RECORDED}` }
          : confirmed
            ? { tone: "muted", text: "Signed out. Your study on this device is still here." }
            : { tone: "warning", text: "Signed out on this device. Verse Together couldn't be reached to end the session there; it expires on its own." },
    );
  }, [runtime, endPendingSignIn, forgetSession]);

  // A deletion that stopped partway is finished the same way it was started.
  const pendingDeletion = base.status === "deletion-pending" ? (watched?.deletion ?? null) : null;
  const deleteAccount = useCallback(async (): Promise<DeleteOutcome> => {
    const owner = user?.appUserId ?? pendingDeletion?.appUserId ?? null;
    if (!runtime || !owner) return { ok: false, reauthenticate: false, message: "Sign in to delete your account." };
    let result: Awaited<ReturnType<NativeAuthClient["deleteUser"]>>;
    try {
      result = await withTimeout(runtime.authClient.deleteUser({}), 60_000);
    } catch {
      return { ok: false, reauthenticate: false, message: OFFLINE_MESSAGE };
    }
    if (result.error) {
      const error = result.error as { code?: string; status?: number };
      if (error.code === "SESSION_EXPIRED") {
        return { ok: false, reauthenticate: true, message: "For your security, sign in with Google again, then delete your account." };
      }
      if (error.status === 429) return { ok: false, reauthenticate: false, message: "Too many attempts. Wait a minute and try again." };
      if (!error.status) return { ok: false, reauthenticate: false, message: OFFLINE_MESSAGE };
      return { ok: false, reauthenticate: false, message: "Your account couldn't be deleted. Try again in a moment." };
    }
    // Its copies went with it: this device's study may be copied to an account again.
    try {
      releaseAccountCopies(studyStorage(), owner);
    } catch {}
    const recorded = await endPendingSignIn();
    const forgotten = await forgetSession({ owner, deleted: true });
    setNotice({
      tone: forgotten && recorded ? "muted" : "warning",
      text: `Your Verse Together account and the study saved in it were deleted. Study saved on this device is still here.${forgotten ? "" : ` ${NOT_FORGOTTEN}`}${recorded ? "" : ` ${PENDING_NOT_RECORDED}`}`,
    });
    return { ok: true };
  }, [runtime, user, pendingDeletion, endPendingSignIn, forgetSession]);

  const copyStudy = useCallback(async (): Promise<CopyResult> => {
    if (!client || !user) return { copied: 0, remaining: 0, error: "Sign in to copy this device's study." };
    if (!client.connectionState().isWebSocketConnected) return { copied: 0, remaining: 0, error: OFFLINE_MESSAGE };
    const call = <T,>(promise: Promise<T>) => withTimeout(promise, ACCOUNT_CALL_TIMEOUT_MS);
    try {
      return await copyDeviceStudy({
        owner: user.appUserId,
        storage: studyStorage(),
        study: deviceStudy.getSnapshot(),
        currentOwner: () => ownerRef.current,
        offlineMessage: OFFLINE_MESSAGE,
        imports: {
          importNote: (args) => call(client.mutation(accountApi.importDeviceNote, args)),
          importAnnotation: (args) => call(client.mutation(accountApi.importVerseAnnotation, args)),
          importHighlight: (args) => call(client.mutation(accountApi.importGuideHighlight, args)),
        },
      });
    } catch (error) {
      return { copied: 0, remaining: 0, error: error instanceof Error ? error.message : "This device's study couldn't be copied." };
    }
  }, [client, user]);

  // Which study the screens show: published before paint, so a signed-in app never flashes this device's study.
  const verifiedOwner = user?.appUserId ?? null;
  useEffect(() => {
    if (!verifiedOwner || !runtime) return;
    const session = sessionBinding(runtime.storage);
    if (!session) return;
    writeLastOwner({ owner: verifiedOwner, session });
    setLastOwner(verifiedOwner);
  }, [verifiedOwner, runtime]);
  const [sync, setSync] = useState<StudySync | null>(null);
  useEffect(() => {
    if (!client || !verifiedOwner) return;
    const engine = new StudySync(verifiedOwner, accountStore(verifiedOwner), convexSyncClient(client)).start();
    syncRef.current = engine;
    setSync(engine);
    return () => {
      engine.dispose();
      if (syncRef.current === engine) syncRef.current = null;
      setSync((current) => (current === engine ? null : current));
    };
  }, [client, verifiedOwner]);
  const studySession = useMemo<StudySession>(() => {
    if (!runtime || !hasSession) return { mode: "device" };
    if (base.status === "deletion-pending") return { mode: "blocked", reason: "deletion-pending" };
    if (verifiedOwner) {
      const store = accountStore(verifiedOwner);
      return { mode: "account", owner: verifiedOwner, store, sync: sync && sync.owner === verifiedOwner ? sync : null };
    }
    // Checking, offline or unverified: the account this session was verified as before, read from its cache (and
    // its changes queued, never sent) until the server confirms it; nothing at all when that isn't known.
    if (lastOwner && base.status !== "signed-out") return { mode: "account", owner: lastOwner, store: accountStore(lastOwner), sync: null };
    return { mode: "blocked", reason: base.status === "error" ? "error" : "checking" };
  }, [runtime, hasSession, base.status, verifiedOwner, lastOwner, sync]);
  // A build without sign-in leaves the default (this device's study) alone.
  useState(() => runtime && setStudySession(studySession, { silent: true }));
  useLayoutEffect(() => {
    if (runtime) setStudySession(studySession);
  }, [runtime, studySession]);
  useEffect(() => () => {
    if (runtime) setStudySession({ mode: "device" });
  }, [runtime]);

  const clearNotice = useCallback(() => setNotice(null), []);
  const retry = useCallback(() => setCheckKey((key) => key + 1), []);

  const value = useMemo<AccountContextValue>(
    () => ({ ...base, user, notice, signingIn, signIn, signOut, deleteAccount, copyStudy, completeReturn, clearNotice, retry }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base.status, base.sessionEmail, user, notice, signingIn, signIn, signOut, deleteAccount, copyStudy, completeReturn, clearNotice, retry],
  );

  return (
    <AccountContext.Provider value={value}>
      {children}
      {runtime && client ? (
        <ConvexBetterAuthProvider key={generation} client={client} authClient={runtime.authClient as unknown as ConvexAuthClient}>
          <SessionWatcher authClient={runtime.authClient} checkKey={checkKey} onState={onWatched} />
        </ConvexBetterAuthProvider>
      ) : null}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
