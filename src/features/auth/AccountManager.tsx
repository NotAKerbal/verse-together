"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faArrowRightFromBracket, faChevronDown, faCircleCheck, faDesktop, faEnvelope, faKey, faLaptop, faMobileScreenButton, faPenToSquare, faShieldHalved, faTabletScreenButton, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import styles from "@/app/account/page.module.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { SIGN_OUT_FAILED, useAuth } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../../convex/authEnvironment";
import { authErrorMessage } from "./authErrors";
import { loadAccountLists, type ListProblem } from "./accountLists";
import {
  FormMessage,
  GoogleButton,
  GoogleMark,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TextField,
  useAuthCapabilities,
} from "./AuthUi";

type LinkedAccount = { providerId: string };
type SessionRow = { id: string; userAgent?: string | null; createdAt: Date | string; expiresAt: Date | string };

function Section({ title, description, icon, summary, children, defaultOpen = false, danger = false }: {
  title: string;
  description: string;
  icon: IconDefinition;
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
}) {
  return (
    <details className={`${styles.accountSection} ${danger ? styles.dangerSection : ""}`} open={defaultOpen}>
      <summary className={styles.accountSummary}>
        <span className={styles.sectionIcon}><FontAwesomeIcon icon={icon} aria-hidden="true" /></span>
        <div className={styles.sectionHeading}>
          <h3>{title}</h3>
          <span className={styles.sectionDescription}>{description}</span>
        </div>
        {summary ? <span className={styles.accountMeta}>{summary}</span> : null}
        <FontAwesomeIcon icon={faChevronDown} className={styles.accountChevron} aria-hidden="true" />
      </summary>
      <div className={styles.accountContent}>{children}</div>
    </details>
  );
}

function describeAgent(agent: string | null | undefined): string {
  if (!agent) return "Unknown device";
  const browser = /Edg(?:e|A|iOS)?\//.test(agent)
    ? "Edge"
    : /Chrome\/|CriOS\//.test(agent)
      ? "Chrome"
      : /Firefox\/|FxiOS\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Mac OS X/.test(agent)
        ? "macOS"
        : /Windows/.test(agent)
          ? "Windows"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Signs out, then leaves for the home page; stays put and says so if the server didn't sign out. */
function SignOutButton({ label }: { label: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={styles.signOut}
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await auth.signOut();
            router.replace("/");
          } catch (signOutError) {
            setError(signOutError instanceof Error ? signOutError.message : SIGN_OUT_FAILED);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : label}
      </button>
      <FormMessage tone="error">{error}</FormMessage>
    </div>
  );
}

export default function AccountManager() {
  const auth = useAuth();

  if (!auth.configured) {
    return (
      <FormMessage tone="info">Accounts aren&apos;t available on this copy of Verse Together.</FormMessage>
    );
  }
  if (auth.pendingDeletion && auth.authUser) {
    return (
      <div className="space-y-3">
        <FormMessage tone="error">Deleting this account started but didn&apos;t finish.</FormMessage>
        <div className="flex flex-wrap gap-2">
          <Link href="/delete-account" className={SECONDARY_BUTTON_CLASS}>
            Finish deleting my account
          </Link>
          <SignOutButton label="Sign out" />
        </div>
      </div>
    );
  }
  if (auth.loading) {
    return (
      <div role="status" aria-busy="true" className="panel-card rounded-[1.35rem] p-4 text-sm text-[color:var(--foreground-muted)]">
        Loading your account…
      </div>
    );
  }
  if (auth.error && auth.authUser) {
    return (
      <div className="space-y-3">
        <FormMessage tone="error">{auth.error}</FormMessage>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void auth.refresh()}>
            Try again
          </button>
          <SignOutButton label="Sign out" />
        </div>
      </div>
    );
  }
  if (!auth.user || !auth.authUser) {
    return (
      <div className={`${styles.settingsCard} ${styles.notice}`}>
        <p className="text-sm">Sign in to manage your account and sync your study. General settings are saved on this device.</p>
        <button
          type="button"
          className={`${PRIMARY_BUTTON_CLASS} w-auto`}
          onClick={() => auth.promptSignIn()}
          disabled={auth.signingIn}
          aria-busy={auth.signingIn || undefined}
        >
          {auth.signingIn ? "Signing in…" : "Sign in"}
        </button>
      </div>
    );
  }
  return <AccountDetails />;
}

function AccountDetails() {
  const auth = useAuth();
  const capabilities = useAuthCapabilities();
  const authUser = auth.authUser!;

  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [listProblem, setListProblem] = useState<ListProblem | null>(null);
  const [listFailed, setListFailed] = useState({ accounts: false, sessions: false });
  const [reloading, setReloading] = useState(false);

  // Never rejects. Each list loads on its own: one that fails keeps its last good value (null before the
  // first load, which the sections show as unavailable rather than as "not set up") without discarding the other.
  const loadLists = useCallback(async () => {
    const outcome = await loadAccountLists<LinkedAccount, SessionRow>({
      accounts: () => authClient.listAccounts(),
      sessions: () => authClient.listSessions(),
    });
    if (outcome.accounts) setAccounts(outcome.accounts);
    if (outcome.sessions) setSessions(outcome.sessions);
    setListFailed(outcome.failed);
    setListProblem(outcome.problem);
  }, []);

  const reloadLists = useCallback(async () => {
    setReloading(true);
    try {
      await loadLists();
    } finally {
      setReloading(false);
    }
  }, [loadLists]);

  useEffect(() => {
    // Fetching external (Better Auth) state on mount.
    void loadLists();
  }, [loadLists]);

  const hasPassword = accounts?.some((account) => account.providerId === "credential") ?? false;
  const hasGoogle = accounts?.some((account) => account.providerId === "google") ?? false;
  // Password and email-confirmation controls appear only once the deployment says email/password is
  // switched on (AUTH_EMAIL_PASSWORD_ENABLED), never while capabilities are loading.
  const emailPassword = capabilities?.emailPassword === true;

  return (
    <div className={styles.accountManager}>
      <div className={styles.profileColumn}>
        {auth.legacyAccountPending ? (
          <FormMessage tone="info">
            We found an earlier Verse Together account with this email that hasn&apos;t been moved over yet. Your earlier
            notes and highlights will appear here once it&apos;s connected; you don&apos;t need to do anything else.
          </FormMessage>
        ) : null}
        <div className={styles.profileCard}><ProfileSection /></div>
        <div className={styles.footer}><SignOutButton label="Sign out" /></div>
      </div>
      <div className={styles.settingsColumn}>
        <div className={styles.accountControls}>
          {listProblem ? (
            <div className="space-y-2">
              <FormMessage tone="error">{listProblem.message}</FormMessage>
              {listProblem.reauthenticate ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  disabled={auth.signingIn}
                  aria-busy={auth.signingIn || undefined}
                  onClick={() => auth.promptSignIn("/account")}
                >
                  {auth.signingIn ? "Signing in…" : "Sign in again"}
                </button>
              ) : (
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  disabled={reloading}
                  aria-busy={reloading || undefined}
                  onClick={() => void reloadLists()}
                >
                  {reloading ? "Reloading…" : "Reload sign-in methods and sessions"}
                </button>
              )}
            </div>
          ) : null}
          {!authUser.emailVerified ? <Section title="Email" description="Confirm your email address" icon={faEnvelope} summary="Not confirmed">
            <p className="text-sm">
              <span className="font-semibold">{authUser.email}</span>{" "}
              <span className="text-[color:var(--foreground-muted)]">
                {authUser.emailVerified ? "· Confirmed" : "· Not confirmed"}
              </span>
            </p>
            {!authUser.emailVerified && capabilities?.emailDelivery ? <ResendVerification email={authUser.email} /> : null}
            {!authUser.emailVerified && emailPassword && !capabilities?.emailDelivery ? (
              <p className="text-xs text-[color:var(--foreground-muted)]">
                Email confirmation isn&apos;t set up on this site yet, so friends can&apos;t find you by email.
              </p>
            ) : null}
          </Section> : null}

          <Section title="Sign-in methods" description="How you access your account" icon={faShieldHalved} defaultOpen summary={accounts === null ? (listFailed.accounts ? "Unavailable" : "Loading…") : [hasGoogle ? "Google" : null, emailPassword && hasPassword ? "Password" : null].filter(Boolean).join(" · ") || "None connected"}>
            {accounts === null ? (
              <ListPlaceholder failed={listFailed.accounts} />
            ) : (
              <ul className={styles.accountRows}>
                {emailPassword ? <li className={styles.accountRow}>
                  <span className={styles.rowIcon}><FontAwesomeIcon icon={faKey} aria-hidden="true" /></span>
                  <span className={styles.rowTitle}>Email and password</span>
                  <ConnectionStatus connected={hasPassword} label={hasPassword ? "Set up" : "Not set up"} />
                </li> : null}
                {!emailPassword || capabilities?.google || hasGoogle ? (
                  <li className={styles.accountRow}>
                    <span className={`${styles.rowIcon} ${styles.googleIcon}`}><GoogleMark /></span>
                    <span className={styles.rowTitle}>Google</span>
                    <ConnectionStatus connected={hasGoogle} label={hasGoogle ? "Connected" : "Not connected"} />
                  </li>
                ) : null}
              </ul>
            )}
            {capabilities?.google && accounts !== null && !hasGoogle ? <ConnectGoogle /> : null}
          </Section>

          {emailPassword ? (
            <Section title="Password" description="Update your sign-in password" icon={faKey}>
              {accounts === null ? null : hasPassword ? (
                <ChangePasswordForm onChanged={loadLists} />
              ) : capabilities?.emailDelivery ? (
                <p className="text-sm">
                  You sign in without a password.{" "}
                  <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
                    Set a password by email
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-[color:var(--foreground-muted)]">You sign in without a password.</p>
              )}
            </Section>
          ) : null}

          <Section title="Signed-in devices" description="Where your account is signed in" icon={faLaptop} defaultOpen summary={sessions === null ? (listFailed.sessions ? "Unavailable" : "Loading…") : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}>
            <SessionsPanel sessions={sessions} failed={listFailed.sessions} onChanged={loadLists} />
          </Section>

          <Section title="Delete account" description="Permanently remove your account and study" icon={faTrashCan} danger>
            <p className={styles.dangerDescription}>
              This permanently deletes your account and all the study saved in it, on the website and in the app. This cannot be undone.
            </p>
            <Link href="/delete-account" className={styles.dangerButton}>
              <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
              Delete my account
            </Link>
          </Section>

        </div>
      </div>
    </div>
  );
}

function ConnectionStatus({ connected, label }: { connected: boolean; label: string }) {
  return <span className={styles.statusBadge} data-connected={connected}>
    {connected ? <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> : null}
    {label}
  </span>;
}

function DeviceIcon({ agent }: { agent?: string | null }) {
  const icon = !agent ? faDesktop : /iPad|Tablet|Android(?!.*Mobile)/i.test(agent) ? faTabletScreenButton
    : /iPhone|Android|Mobile/i.test(agent) ? faMobileScreenButton : faLaptop;
  return <span className={styles.rowIcon}><FontAwesomeIcon icon={icon} aria-hidden="true" /></span>;
}

function SessionDate({ value }: { value: Date | string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <span className={styles.rowDescription}>Signed in <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></span>;
}

function ListPlaceholder({ failed }: { failed: boolean }) {
  return failed ? (
    <p className="text-sm text-[color:var(--foreground-muted)]">Couldn&apos;t load this right now.</p>
  ) : (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
      Loading…
    </p>
  );
}

function ProfileSection() {
  const auth = useAuth();
  const [name, setName] = useState(auth.authUser?.name ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        setMessage({ tone: "error", text: authErrorMessage(error) });
        return;
      }
      await auth.refresh();
      setMessage({ tone: "success", text: "Name saved." });
    } catch {
      setMessage({ tone: "error", text: authErrorMessage(null) });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={styles.profileEditor}>
      <summary className={styles.profile} aria-label={`Edit profile for ${auth.authUser?.name || "your account"}`}>
        {auth.user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- identity-provider avatar
          <img className={styles.avatar} src={auth.user.imageUrl} alt="" referrerPolicy="no-referrer" />
        ) : <span className={styles.guestAvatar} aria-hidden="true">{(auth.authUser?.name || auth.authUser?.email || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>}
        <div className={styles.identity}>
          <h3>{auth.authUser?.name || "Your account"}</h3>
          <p>{auth.authUser?.email}</p>
        </div>
        <span className={styles.edit}>
          <span className={styles.editLabel}>Edit profile</span>
          <FontAwesomeIcon icon={faPenToSquare} className={styles.editIcon} aria-hidden="true" />
        </span>
      </summary>
      <form onSubmit={handleSubmit} className={styles.profileForm}>
        <TextField
          label="Display name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        <button type="submit" className={SECONDARY_BUTTON_CLASS} disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save name"}
        </button>
      </form>
    </details>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={SECONDARY_BUTTON_CLASS}
        disabled={state === "pending" || state === "sent"}
        onClick={async () => {
          setState("pending");
          setError(null);
          try {
            const { error: sendError } = await authClient.sendVerificationEmail({ email, callbackURL: "/account" });
            if (sendError) {
              setError(authErrorMessage(sendError));
              setState("error");
            } else {
              setState("sent");
            }
          } catch {
            setError(authErrorMessage(null));
            setState("error");
          }
        }}
      >
        {state === "pending" ? "Sending…" : state === "sent" ? "Confirmation sent" : "Send confirmation email"}
      </button>
      {state === "error" ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}

function ConnectGoogle() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <GoogleButton
        label="Connect Google"
        pending={pending}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(null);
          try {
            const { error: linkError } = await authClient.linkSocial({
              provider: "google",
              callbackURL: "/account",
              errorCallbackURL: "/account",
            });
            if (linkError) {
              setError(authErrorMessage(linkError));
              setPending(false);
            }
            // On success the browser is navigating to Google; keep the pending state.
          } catch {
            setError(authErrorMessage(null));
            setPending(false);
          }
        }}
      />
      <p className="text-xs text-[color:var(--foreground-muted)]">The Google account must use the same email address.</p>
      <FormMessage tone="error">{error}</FormMessage>
    </div>
  );
}

function ChangePasswordForm({ onChanged }: { onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const nextError =
    touched && next.length > 0 && next.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : null;
  const confirmError = touched && confirm.length > 0 && confirm !== next ? "Passwords don't match." : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (pending || next.length < MIN_PASSWORD_LENGTH || next !== confirm) return;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (error) {
        setMessage({ tone: "error", text: authErrorMessage(error) });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setTouched(false);
      setMessage({ tone: "success", text: "Password changed. Your other devices were signed out." });
      await onChanged();
    } catch {
      setMessage({ tone: "error", text: authErrorMessage(null) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField
        label="Current password"
        type="password"
        name="current-password"
        autoComplete="current-password"
        required
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <TextField
        label="New password"
        type="password"
        name="new-password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        error={nextError}
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <TextField
        label="Confirm new password"
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        required
        error={confirmError}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <button type="submit" className={SECONDARY_BUTTON_CLASS} disabled={pending} aria-busy={pending}>
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

function SessionsPanel({
  sessions,
  failed,
  onChanged,
}: {
  sessions: SessionRow[] | null;
  failed: boolean;
  onChanged: () => Promise<void>;
}) {
  const { data: current } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (sessions === null) return <ListPlaceholder failed={failed} />;
  const currentId = current?.session?.id;
  const others = sessions.filter((session) => session.id !== currentId);

  return (
    <div className="space-y-3">
      <ul className={styles.accountRows}>
        {[...sessions].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId)).map((session) => (
          <li key={session.id} className={styles.accountRow} data-current={session.id === currentId}>
            <DeviceIcon agent={session.userAgent} />
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{describeAgent(session.userAgent)}</span>
              <SessionDate value={session.createdAt} />
            </span>
            {session.id === currentId ? <span className={styles.currentBadge}>This device</span> : null}
          </li>
        ))}
      </ul>
      {sessions.length === 0 ? <p className={styles.rowDescription}>No signed-in devices to show.</p> : null}
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <button
        type="button"
        className={SECONDARY_BUTTON_CLASS}
        disabled={pending || !currentId || others.length === 0}
        aria-busy={pending}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setMessage(null);
          try {
            const { error } = await authClient.revokeOtherSessions();
            if (error) {
              setMessage({ tone: "error", text: authErrorMessage(error) });
              return;
            }
            setMessage({ tone: "success", text: "Signed out of your other devices." });
            await onChanged();
          } catch {
            setMessage({ tone: "error", text: authErrorMessage(null) });
          } finally {
            setPending(false);
          }
        }}
      >
        <FontAwesomeIcon icon={faArrowRightFromBracket} aria-hidden="true" className={styles.actionIcon} />
        {pending ? "Signing out…" : "Sign out other devices"}
      </button>
      <p className={styles.rowDescription}>This device stays signed in.</p>
    </div>
  );
}
