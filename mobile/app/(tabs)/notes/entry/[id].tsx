import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Button, Notice, Page, Txt } from "../../../../src/components/ui";
import EntryEditor from "../../../../src/features/journal/EntryEditor";
import { useJournalNote } from "../../../../src/storage/journalData";
import { useTheme } from "../../../../src/theme/theme";

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const state = useJournalNote(String(id));
  if (state.status !== "ready") {
    const message =
      state.status === "loading"
        ? null
        : state.status === "unavailable"
          ? state.mode === "account"
            ? "This entry hasn’t been downloaded to this device yet. Connect to the internet to open it."
            : "Your account is still being checked. Try again in a moment."
          : state.mode === "account"
            ? "This entry isn’t in your journal. It may have been deleted."
            : "This entry isn’t on this device. It may have been deleted.";
    return (
      <Page>
        <View style={{ gap: 12 }}>
          {message ? (
            <Notice tone="warning">{message}</Notice>
          ) : (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading entry" style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ActivityIndicator color={colors.accentRubric} />
              <Txt>Loading entry…</Txt>
            </View>
          )}
          <Button variant="secondary" label="Back to Journal" onPress={() => router.replace("/notes")} />
        </View>
      </Page>
    );
  }
  // Keyed by the route's id so another entry opens with its own text and revision, while a new entry the account has
  // just named (a different id for the same entry) keeps its editor and anything typed in it.
  return <EntryEditor key={String(id)} mode="edit" note={state.note} study={state.mode} sync={state.sync} deleting={state.deleting} />;
}
