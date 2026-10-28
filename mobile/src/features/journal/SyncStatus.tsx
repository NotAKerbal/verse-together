// Signed in: where the account's study stands on this device. Offline, changes are kept here and sent later;
// a change that failed can be tried again; a change that met a newer one in the account waits for its owner's choice
// (opened from here: the entry, or the verse). Signed out, nothing is shown.

import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { Button, Notice } from "../../components/ui";
import { chapterPath } from "../../navigation/hrefs";
import { resolveAlias, type Op } from "../../storage/accountStudy";
import { journalStudy, useAccountSnapshot, type JournalData } from "../../storage/journalData";
import { useStudySession } from "../../storage/studySession";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function conflictLabel(op: Op): string {
  switch (op.kind) {
    case "create":
    case "save":
    case "reading":
    case "delete":
      return "A journal entry";
    default:
      return `A note on ${op.kind === "marks" ? `chapter ${op.chapter.chapter}` : `verse ${op.target.chapter}:${op.target.verse}`}`;
  }
}

export function SyncStatus({ data }: { data: JournalData }) {
  const router = useRouter();
  const { colors } = useTheme();
  const session = useStudySession();
  const snapshot = useAccountSnapshot(session);
  const conflicts = useMemo(() => snapshot?.outbox.ops.filter((op) => op.status === "conflict") ?? [], [snapshot]);
  if (data.mode === "device") return null;
  if (data.mode === "blocked") {
    return (
      <Notice tone="warning">
        {session.mode === "blocked" && session.reason === "deletion-pending"
          ? "Deleting your account didn't finish. Finish deleting it in Settings, or sign out to use the study on this device."
          : "Your account is being checked. Your journal will appear here in a moment."}
      </Notice>
    );
  }
  const sync = data.sync;
  const open = (op: Op) => {
    if (op.kind === "marks" || op.kind === "verseNote" || op.kind === "verseDelete") {
      const target = op.kind === "marks" ? op.chapter : op.target;
      router.push(chapterPath(target.volume, target.book, target.chapter, op.kind === "marks" ? op.verses[0] : op.target.verse) as never);
      return;
    }
    const id = op.kind === "create" ? op.localId : resolveAlias(snapshot?.outbox.aliases ?? {}, op.noteId);
    router.push(`/notes/entry/${encodeURIComponent(id)}` as never);
  };
  const waiting = sync ? sync.waiting - sync.errors - sync.conflicts : 0;
  return (
    <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
      {snapshot?.loadError ? <Notice tone="warning">{snapshot.loadError}</Notice> : null}
      {snapshot?.syncError ? <Notice tone="warning">{snapshot.syncError}</Notice> : null}
      {data.online === false ? (
        <Notice>{`You're offline.${waiting > 0 ? ` ${plural(waiting, "change is", "changes are")} saved on this device and will sync when you're back online.` : " Your journal shows what was last synced to this device."}`}</Notice>
      ) : data.online === null ? (
        <Notice>{`Connecting to your account…${waiting > 0 ? ` ${plural(waiting, "change is", "changes are")} saved on this device and will sync once connected.` : " Your journal shows what was last synced to this device."}`}</Notice>
      ) : waiting > 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundSoft }}>{`Syncing ${plural(waiting, "change", "changes")} to your account…`}</Text>
      ) : null}
      {sync && sync.errors > 0 ? (
        <View accessibilityRole="alert" style={{ gap: 8 }}>
          <Notice tone="warning">{`${plural(sync.errors, "change hasn't", "changes haven't")} reached your account yet. ${sync.errors === 1 ? "It's" : "They're"} saved on this device and will try again.`}</Notice>
          <Button variant="secondary" icon="rotate" label="Try sync again" style={{ alignSelf: "flex-start" }} onPress={() => journalStudy.retry()} testID="sync-retry" />
        </View>
      ) : null}
      {conflicts.length ? (
        <View accessibilityRole="alert" style={{ gap: 8 }}>
          <Notice tone="warning">{`${plural(conflicts.length, "change needs", "changes need")} your choice: ${conflicts.length === 1 ? "it was" : "they were"} also changed on the website or another device. Nothing was overwritten.`}</Notice>
          {conflicts.map((op) => (
            <Button key={op.opId} variant="secondary" label={`Review: ${conflictLabel(op)}`} style={{ alignSelf: "flex-start" }} onPress={() => open(op)} />
          ))}
        </View>
      ) : null}
      {data.deviceOnly > 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.foregroundMuted }}>
          {`${plural(data.deviceOnly, "item of study saved only on this device isn't", "items of study saved only on this device aren't")} shown while you're signed in. Copy ${data.deviceOnly === 1 ? "it" : "them"} to your account in Settings, or sign out to see ${data.deviceOnly === 1 ? "it" : "them"}.`}
        </Text>
      ) : null}
    </View>
  );
}
