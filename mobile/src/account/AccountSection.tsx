// Settings → Account: Google sign-in with the same account as the website, an explicit copy of this device's study
// into it, sign-out, and account deletion (including finishing one that stopped partway). Signed in, the app's
// study screens use the account's study (synced with the website); this device's own study waits on the device.

import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { openExternal } from "../components/Blocks";
import { Button, Notice, Txt } from "../components/ui";
import { WEB_ORIGIN } from "../navigation/hrefs";
import { storage } from "../storage/kv";
import { useDeviceStudy } from "../storage/study";
import { useAccountSnapshot } from "../storage/journalData";
import { useStudySession } from "../storage/studySession";
import { useTheme } from "../theme/theme";
import { fonts } from "../theme/tokens";
import { useAccount, type AccountLists, type ManageOutcome } from "./AccountProvider";
import { copySummary, readLedger, type CopySummary } from "./guestCopy";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function useCopySummary(owner: string | null, version: number): { summary: CopySummary | null; error: string | null } {
  const study = useDeviceStudy();
  return useMemo(() => {
    if (!owner) return { summary: null, error: null };
    try {
      return { summary: copySummary(study, readLedger(storage()), owner), error: null };
    } catch (error) {
      return { summary: null, error: error instanceof Error ? error.message : "This device's copy record couldn't be read." };
    }
    // `version` re-reads the ledger after a copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study, owner, version]);
}

function CopyStudyCard() {
  const { colors } = useTheme();
  const { user, copyStudy } = useAccount();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "muted" | "warning"; text: string } | null>(null);
  const { summary, error } = useCopySummary(user?.appUserId ?? null, version);
  if (!user) return null;
  if (error) return <Notice tone="warning">{error}</Notice>;
  if (!summary) return null;
  const run = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await copyStudy();
    setBusy(false);
    setVersion((value) => value + 1);
    if (outcome.error) {
      setResult({ tone: "warning", text: outcome.copied > 0 ? `${plural(outcome.copied, "item was", "items were")} copied. ${outcome.error}` : outcome.error });
    } else {
      setResult({ tone: "muted", text: outcome.copied > 0 ? `Copied ${plural(outcome.copied, "item", "items")} to your account. They're still on this device too.` : "Everything on this device is already in your account." });
    }
  };
  return (
    <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground }}>
        Study on this device
      </Text>
      {summary.toCopy > 0 ? (
        <>
          <Txt style={{ lineHeight: 22 }}>
            {`${plural(summary.toCopy, "journal entry, note or mark isn’t", "journal entries, notes and marks aren’t")} in your account yet. Copy ${summary.toCopy === 1 ? "it" : "them"} to see ${summary.toCopy === 1 ? "it" : "them"} on the website?`}
          </Txt>
          <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
            {"Only when you choose. Everything stays on this device as it is, and shows again when you sign out. While you're signed in, the app shows your account's study."}
          </Txt>
          <Button variant="secondary" icon="cloud-arrow-up" label={busy ? "Copying…" : "Copy to my account"} busy={busy} disabled={busy} style={{ alignSelf: "flex-start" }} onPress={() => void run()} />
        </>
      ) : (
        <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
          {summary.copied > 0 ? `${plural(summary.copied, "item from this device is", "items from this device are")} in your account.` : "Nothing on this device to copy."}
        </Txt>
      )}
      {summary.elsewhere > 0 ? (
        <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
          {`${plural(summary.elsewhere, "item was", "items were")} copied to a different account and won't be copied to this one.`}
        </Txt>
      ) : null}
      {result ? (
        <View accessibilityRole={result.tone === "warning" ? "alert" : undefined} accessibilityLiveRegion="polite">
          <Notice tone={result.tone}>{result.text}</Notice>
        </View>
      ) : null}
    </View>
  );
}

/** "Chrome on Android", as the web's AccountManager names a session's device. */
export function describeAgent(agent: string | null | undefined): string {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : /okhttp|Expo|Verse ?Together/i.test(agent) ? "Verse Together app" : "Browser";
  const os = /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Mac OS X/.test(agent) ? "macOS" : /Windows/.test(agent) ? "Windows" : /Linux/.test(agent) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function Outcome({ outcome, success }: { outcome: ManageOutcome | null; success: string }) {
  if (!outcome) return null;
  return (
    <View accessibilityRole={outcome.ok ? undefined : "alert"} accessibilityLiveRegion="polite">
      <Notice tone={outcome.ok ? "muted" : "warning"}>{outcome.ok ? success : outcome.message}</Notice>
    </View>
  );
}

/** The web's profile editor: the account's display name, saved to the account (and shown on the website too). */
function ProfileCard() {
  const { colors } = useTheme();
  const { user, updateName } = useAccount();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ManageOutcome | null>(null);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setOutcome(null);
    const result = await updateName(name);
    setBusy(false);
    setOutcome(result);
    if (result.ok) setEditing(false);
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <Txt style={{ fontFamily: fonts.sansSemiBold, fontSize: 16 }}>{user?.name ?? user?.email ?? "Signed in"}</Txt>
        {user?.email && user.name ? <Txt style={{ fontSize: 13, color: colors.foregroundMuted }}>{user.email}</Txt> : null}
      </View>
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="Display name"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChangeText={setName}
            style={{ borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 10, backgroundColor: colors.inputSurface, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.sans, fontSize: 15, color: colors.foreground }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Button variant="secondary" label={busy ? "Saving…" : "Save name"} busy={busy} disabled={busy || !name.trim()} onPress={() => void save()} />
            <Button variant="quiet" label="Cancel" disabled={busy} onPress={() => { setEditing(false); setName(user?.name ?? ""); setOutcome(null); }} />
          </View>
        </View>
      ) : (
        <Button variant="secondary" icon="pen" label="Edit name" style={{ alignSelf: "flex-start" }} onPress={() => { setName(user?.name ?? ""); setOutcome(null); setEditing(true); }} />
      )}
      <Outcome outcome={outcome} success="Name saved." />
    </View>
  );
}

/**
 * The web's "Sign-in methods" and "Sessions": loaded when asked for (each list on its own; one failing keeps the
 * other), with Sign out other devices. A list that needs a fresh sign-in offers Google again rather than a retry loop.
 */
function SignInDetailsCard() {
  const { colors } = useTheme();
  const { loadAccountLists, revokeOtherSessions, signIn, signingIn } = useAccount();
  const [lists, setLists] = useState<AccountLists | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [outcome, setOutcome] = useState<ManageOutcome | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const next = await loadAccountLists();
    setLoading(false);
    // Keep each list's last good answer when only the other one loaded.
    setLists((previous) => (next ? { ...next, accounts: next.accounts ?? previous?.accounts, sessions: next.sessions ?? previous?.sessions } : previous));
  }, [loadAccountLists]);
  const revoke = async () => {
    setRevoking(true);
    setOutcome(null);
    const result = await revokeOtherSessions();
    setRevoking(false);
    setOutcome(result);
    if (result.ok) await load();
  };
  const confirmRevoke = () =>
    Alert.alert("Sign out your other devices?", "Every other browser and device signed in to this account is signed out. This device stays signed in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out other devices", style: "destructive", onPress: () => void revoke() },
    ]);
  const accounts = lists?.accounts;
  const sessions = lists?.sessions;
  const hasGoogle = accounts?.some((account) => account.providerId === "google") ?? false;
  const hasPassword = accounts?.some((account) => account.providerId === "credential") ?? false;
  const others = sessions?.filter((session) => session.id !== lists?.currentSessionId) ?? [];
  return (
    <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground }}>
        Sign-in methods and devices
      </Text>
      {!open ? (
        <Button
          variant="secondary"
          icon="list"
          label="Show sign-in methods and devices"
          style={{ alignSelf: "flex-start" }}
          onPress={() => {
            setOpen(true);
            void load();
          }}
        />
      ) : (
        <>
          {loading && !lists ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading sign-in methods and devices" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.accentRubric} />
              <Txt>Loading…</Txt>
            </View>
          ) : null}
          {lists?.problem ? (
            <View accessibilityRole="alert" style={{ gap: 10 }}>
              <Notice tone="warning">{lists.problem.message}</Notice>
              {lists.problem.reauthenticate ? (
                <Button
                  variant="secondary"
                  label={signingIn ? "Opening Google…" : "Sign in with Google again"}
                  busy={signingIn}
                  disabled={signingIn}
                  style={{ alignSelf: "flex-start" }}
                  onPress={() => void signIn().then((result) => (result?.kind === "signed-in" ? load() : undefined))}
                />
              ) : (
                <Button variant="secondary" icon="rotate" label={loading ? "Reloading…" : "Reload sign-in methods and devices"} busy={loading} disabled={loading} style={{ alignSelf: "flex-start" }} onPress={() => void load()} />
              )}
            </View>
          ) : null}
          {accounts ? (
            <View style={{ gap: 2 }}>
              <Txt style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>Sign-in methods</Txt>
              <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>{`Google: ${hasGoogle ? "connected" : "not connected"}`}</Txt>
              {hasPassword ? <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>Email and password: set up (manage it on the website)</Txt> : null}
            </View>
          ) : lists && lists.failed.accounts ? (
            <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>Sign-in methods couldn’t be loaded right now.</Txt>
          ) : null}
          {sessions ? (
            <View style={{ gap: 6 }}>
              <Txt style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>{`Sessions · ${plural(sessions.length, "device", "devices")}`}</Txt>
              {sessions.map((session) => (
                <Txt key={session.id} style={{ fontSize: 13.5, color: colors.foregroundMuted }}>
                  {`${describeAgent(session.userAgent)}${session.id === lists?.currentSessionId ? " · This device" : ""}`}
                </Txt>
              ))}
              <Button
                variant="secondary"
                icon="right-from-bracket"
                label={revoking ? "Signing out other devices…" : "Sign out other devices"}
                busy={revoking}
                disabled={revoking || others.length === 0}
                style={{ alignSelf: "flex-start" }}
                onPress={confirmRevoke}
              />
              <Outcome outcome={outcome} success="Signed out of your other devices." />
            </View>
          ) : lists && lists.failed.sessions ? (
            <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>Sessions couldn’t be loaded right now.</Txt>
          ) : null}
        </>
      )}
    </View>
  );
}

const DELETE_COPY = {
  start: {
    title: "Delete account",
    body: "Deletes your Verse Together account and all the study saved in it. You'll be asked to confirm.",
    button: "Delete my account",
    confirmTitle: "Delete your Verse Together account?",
    confirmButton: "Delete account",
  },
  finish: {
    title: "Finish deleting your account",
    body: "Deleting your account started but didn't finish. Its study can't be used any more; finish deleting it to remove what's left. You'll be asked to confirm.",
    button: "Finish deleting my account",
    confirmTitle: "Finish deleting your Verse Together account?",
    confirmButton: "Finish deleting",
  },
} as const;

function DeleteAccount({ resume = false }: { resume?: boolean }) {
  const copy = DELETE_COPY[resume ? "finish" : "start"];
  const { colors } = useTheme();
  const { deleteAccount, signIn, signingIn } = useAccount();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; reauthenticate: boolean } | null>(null);
  const run = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await deleteAccount();
    setBusy(false);
    if (!outcome.ok) setProblem({ text: outcome.message, reauthenticate: outcome.reauthenticate });
  };
  const confirm = () =>
    Alert.alert(
      copy.confirmTitle,
      "This permanently deletes your account and everything saved in it, on the website and in the app: journal entries, notes, marks, reading history, goals, plans, shares, comments and friends. Your Google sign-in is unlinked. Study saved only on this device stays here. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: copy.confirmButton, style: "destructive", onPress: () => void run() },
      ],
    );
  return (
    <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground }}>
        {copy.title}
      </Text>
      <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
        {copy.body}
      </Txt>
      <Button variant="danger" icon="trash" label={busy ? "Deleting…" : copy.button} busy={busy} disabled={busy || signingIn} style={{ alignSelf: "flex-start" }} onPress={confirm} />
      {problem ? (
        <View accessibilityRole="alert" style={{ gap: 10 }}>
          <Notice tone="warning">{problem.text}</Notice>
          {problem.reauthenticate ? (
            <Button
              variant="secondary"
              label={signingIn ? "Opening Google…" : "Sign in with Google again"}
              busy={signingIn}
              disabled={signingIn}
              style={{ alignSelf: "flex-start" }}
              onPress={() => {
                void signIn().then((outcome) => {
                  if (outcome?.kind === "signed-in") setProblem(null);
                });
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function AccountSection() {
  const { colors } = useTheme();
  const account = useAccount();
  const { status, user, sessionEmail, notice, signingIn } = account;
  const [signingOut, setSigningOut] = useState(false);
  const session = useStudySession();
  const snapshot = useAccountSnapshot(session);
  const unsynced = snapshot?.outbox.ops.length ?? 0;
  const doSignOut = async () => {
    setSigningOut(true);
    await account.signOut();
    setSigningOut(false);
  };
  // Changes not yet in the account stay on this device for it (sent when it signs in here again), but say so first.
  const signOut = async () => {
    if (!unsynced) return doSignOut();
    Alert.alert(
      "Sign out with changes not yet synced?",
      `${plural(unsynced, "change you made here hasn't", "changes you made here haven't")} reached your account yet. ${unsynced === 1 ? "It stays" : "They stay"} on this device and will sync the next time you sign in to this account here.`,
      [
        { text: "Stay signed in", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void doSignOut() },
      ],
    );
  };
  const noticeView = notice ? (
    <View accessibilityRole={notice.tone === "warning" ? "alert" : undefined} accessibilityLiveRegion="polite">
      <Notice tone={notice.tone}>{notice.text}</Notice>
    </View>
  ) : null;
  const signOutButton = <Button variant="secondary" icon="right-from-bracket" label={signingOut ? "Signing out…" : "Sign out"} busy={signingOut} disabled={signingOut} style={{ alignSelf: "flex-start" }} onPress={() => void signOut()} />;

  if (status === "unavailable") {
    return (
      <>
        <Txt style={{ lineHeight: 22 }}>You’re studying without an account. Your journal, verse notes, marks and goals are saved on this device only.</Txt>
        <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
          Signing in isn’t set up in this build of the app. Your account’s study stays on the website.
        </Txt>
        <Button variant="secondary" icon="arrow-up-right-from-square" label="Open Verse Together on the web" style={{ alignSelf: "flex-start" }} onPress={() => void openExternal(WEB_ORIGIN)} />
      </>
    );
  }

  if (status === "signed-out") {
    return (
      <>
        <Txt style={{ lineHeight: 22 }}>You’re studying without an account. Your journal, verse notes, marks and goals are saved on this device, and reading works offline.</Txt>
        <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
          Sign in with the Google account you use on the website to use your account’s journal, verse notes and marks here, to copy this device’s study to your account, or to delete your account. Nothing is uploaded unless you choose to copy it.
        </Txt>
        <Button
          icon="right-to-bracket"
          label={signingIn ? "Opening Google…" : "Continue with Google"}
          busy={signingIn}
          disabled={signingIn}
          style={{ alignSelf: "flex-start" }}
          onPress={() => void account.signIn()}
        />
        {noticeView}
      </>
    );
  }

  if (status === "checking") {
    return (
      <>
        <View accessibilityRole="progressbar" accessibilityLabel="Checking your account" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator color={colors.accentRubric} />
          <Txt>{sessionEmail ? `Checking your account (${sessionEmail})…` : "Checking your account…"}</Txt>
        </View>
        {noticeView}
      </>
    );
  }

  if (status === "deletion-pending") {
    return (
      <>
        <Notice tone="warning">
          {`Deleting the Verse Together account${sessionEmail ? ` for ${sessionEmail}` : ""} didn’t finish. Finish deleting it below, or sign out. Your study on this device is still here.`}
        </Notice>
        {signOutButton}
        {noticeView}
        <DeleteAccount resume />
      </>
    );
  }

  if (status === "offline" || status === "error") {
    return (
      <>
        <Notice tone="warning">
          {status === "offline"
            ? `${sessionEmail ? `Signed in as ${sessionEmail}, but` : "You’re signed in, but"} Verse Together can’t be reached right now. Your study on this device is still here.`
            : "Your account couldn’t be checked. Try again, or sign out and sign in again. Your study on this device is still here."}
        </Notice>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Button variant="secondary" icon="rotate" label="Try again" onPress={account.retry} />
          {signOutButton}
        </View>
        {noticeView}
      </>
    );
  }

  return (
    <>
      <ProfileCard />
      <Txt style={{ fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
        Signed in with Google, the same account as on the website. Your journal, verse notes, marks and goals here are your account’s, kept in sync with the website and available offline. Study saved only on this device stays here and shows again when you sign out.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button variant="secondary" icon="arrow-up-right-from-square" label="Open your journal on the web" onPress={() => void openExternal(`${WEB_ORIGIN}/notes`)} />
        {signOutButton}
      </View>
      {noticeView}
      <CopyStudyCard />
      <SignInDetailsCard />
      <DeleteAccount />
    </>
  );
}
