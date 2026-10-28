import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Button, Notice, Page } from "../../../../src/components/ui";
import { setDraftIntent } from "../../../../src/features/journal/draftIntent";
import { EntryRow, JournalInvitation, JournalRevisit, plural, sortEntries, useJournal } from "../../../../src/features/journal/JournalParts";
import { openJournalEntry } from "../../../../src/features/journal/openEntry";
import { entryKey, formatDayHeading, localDateKey } from "../../../../src/shared/web";
import { useTheme } from "../../../../src/theme/theme";
import { fonts } from "../../../../src/theme/tokens";

export default function JournalDayScreen() {
  const { date: param } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { entries } = useJournal();
  const [openError, setOpenError] = useState<string | null>(null);
  const open = (entry: Parameters<typeof openJournalEntry>[1]) => {
    setOpenError(null);
    openJournalEntry(router, entry, setOpenError);
  };
  const today = localDateKey();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(param)) ? String(param) : today;
  const isToday = date === today;
  // Readings logged in the account (on the website) show here too, as on the web's day view.
  const dayEntries = useMemo(() => sortEntries(entries.filter((entry) => entry.journal_date === date)), [entries, date]);
  const write = (prompt?: string) => {
    setDraftIntent({ source: null, body: "", reading: false, journalDate: date, prompt });
    router.push("/notes/new");
  };
  return (
    <Page gap={14}>
      <Button variant="quiet" icon="chevron-left" label="Calendar" accessibilityLabel="Back to calendar" style={{ alignSelf: "flex-start", paddingHorizontal: 8 }} onPress={() => (router.canGoBack() ? router.back() : router.replace("/notes"))} />
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.foreground }}>
        {formatDayHeading(date)}
        {isToday ? <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.accentRubric }}>{"  Today"}</Text> : null}
      </Text>
      <JournalInvitation onWrite={(prompt) => write(prompt)} />
      <Button variant="secondary" icon="plus" label="New note" style={{ alignSelf: "flex-start" }} onPress={() => write()} testID="day-new-note" />
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
          {isToday ? "Today’s journal" : "This day’s journal"}
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundSoft }}>{plural(dayEntries.length, "entry", "entries")}</Text>
      </View>
      {dayEntries.length === 0 ? (
        <Notice>Nothing recorded for this day yet. A sentence is enough to begin.</Notice>
      ) : (
        <View style={{ gap: 10 }}>
          {dayEntries.map((entry) => (
            <EntryRow key={entryKey(entry)} entry={entry} onOpen={open} />
          ))}
        </View>
      )}
      {openError ? <Notice tone="warning">{openError}</Notice> : null}
      <JournalRevisit entries={entries} before={date < today ? date : today} onOpen={open} />
    </Page>
  );
}
