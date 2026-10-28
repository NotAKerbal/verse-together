import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Card, Icon, IconButton, Notice, Page, Txt } from "../../../src/components/ui";
import { setDraftIntent } from "../../../src/features/journal/draftIntent";
import {
  EntryRow,
  JournalGoalsPanel,
  JournalInvitation,
  JournalRevisit,
  MonthCalendar,
  plural,
  useJournal,
} from "../../../src/features/journal/JournalParts";
import { openJournalEntry } from "../../../src/features/journal/openEntry";
import { searchJournal } from "../../../src/features/journal/search";
import { SyncStatus } from "../../../src/features/journal/SyncStatus";
import { entryKey, localDateKey, monthKeyOf } from "../../../src/shared/web";
import { deviceStudyLoadError } from "../../../src/storage/study";
import { useTheme } from "../../../src/theme/theme";
import { fonts } from "../../../src/theme/tokens";

export default function JournalScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const journal = useJournal();
  const { entries, goals, bodies } = journal;
  const today = localDateKey();
  const [month, setMonth] = useState(monthKeyOf(today));
  const [query, setQuery] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const loadError = journal.mode === "device" ? deviceStudyLoadError() : null;
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) map.set(entry.journal_date, (map.get(entry.journal_date) ?? 0) + 1);
    return map;
  }, [entries]);
  const results = useMemo(() => searchJournal(entries, bodies, query), [entries, bodies, query]);
  const open = (entry: Parameters<typeof openJournalEntry>[1]) => {
    setOpenError(null);
    openJournalEntry(router, entry, setOpenError);
  };

  const write = (prompt?: string) => {
    setDraftIntent({ source: null, body: "", reading: false, journalDate: today, prompt });
    router.push("/notes/new");
  };

  return (
    <Page gap={16}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.serif, fontSize: 30, color: colors.foreground }}>
          Journal
        </Text>
        <IconButton icon="plus" label="New note for today" onPress={() => write()} testID="journal-new" />
        <IconButton icon="gear" label="Settings and account" onPress={() => router.push("/settings")} />
      </View>
      {loadError ? <Notice tone="warning">{`${loadError} Nothing on this device was changed.`}</Notice> : null}
      <SyncStatus data={journal} />
      {journal.status === "loading" ? <Txt accessibilityRole="progressbar" style={{ fontSize: 13, color: colors.foregroundSoft }}>Loading your journal…</Txt> : null}
      {openError ? <Notice tone="warning">{openError}</Notice> : null}
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.inputSurface }}
      >
        <Icon name="magnifying-glass" size={14} color={colors.foregroundSoft} />
        <TextInput
          testID="journal-search"
          accessibilityLabel="Search your journal"
          placeholder="Search your journal"
          placeholderTextColor={colors.foregroundSoft}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{ flex: 1, fontFamily: fonts.sans, fontSize: 16, color: colors.foreground, paddingVertical: 10 }}
        />
        {query ? <IconButton icon="xmark" size={36} label="Clear search" onPress={() => setQuery("")} /> : null}
      </View>
      {query.trim() ? (
        <View style={{ gap: 10 }} accessibilityLabel="Search results">
          <Txt accessibilityLiveRegion="polite" style={{ fontSize: 13, color: colors.foregroundSoft }}>
            {results.length ? plural(results.length, "entry matches", "entries match") : "No entries match. Try other words."}
          </Txt>
          {results.map((entry) => (
            <View key={entryKey(entry)} style={{ gap: 4 }}>
              <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>{entry.journal_date}</Txt>
              <EntryRow entry={entry} onOpen={open} />
            </View>
          ))}
        </View>
      ) : (
        <>
          <JournalInvitation onWrite={(prompt) => write(prompt)} />
          <Card style={{ borderRadius: 11.2 }}>
            <MonthCalendar
              month={month}
              onMonth={setMonth}
              countsByDay={countsByDay}
              today={today}
              selectedDate={null}
              onSelectDate={(date) => router.push(`/notes/day/${date}` as never)}
            />
            <JournalGoalsPanel entries={entries} today={today} goals={goals} />
          </Card>
          <JournalRevisit entries={entries} before={today} onOpen={open} />
          {journal.mode === "device" ? (
            <Notice>Your journal, verse notes and marks are saved on this device. Sign in from Settings to use your account’s journal here and on the website.</Notice>
          ) : null}
        </>
      )}
    </Page>
  );
}
