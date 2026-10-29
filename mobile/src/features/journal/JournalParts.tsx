// The Journal's phone sections (JournalHomeSections.tsx and JournalWorkspace.tsx): the reflection invitation, the
// month calendar, weekly goals with their editor, this month's study, a thought worth revisiting, and entry rows.
// Progress comes only from recorded entries (the shared journalHome.ts rules); nothing is invented.

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Sheet from "../../components/Sheet";
import { Button, Card, Icon, IconButton, Txt } from "../../components/ui";
import {
  DEFAULT_JOURNAL_GOALS,
  MAX_WEEKLY_REFLECTIONS,
  REFLECTION_PROMPTS,
  dateFromKey,
  entryKey,
  entryTime,
  formatMonthHeading,
  formatTime,
  journalGoalsProblem,
  journalHomeProgress,
  journalRevisit,
  localDateKey,
  monthGrid,
  monthKeyOf,
  shiftMonth,
  sourceKindLabel,
  type JournalEntry,
  type JournalGoals,
  type JournalNoteEntry,
} from "../../shared/web";
import { journalStudy, useJournalData } from "../../storage/journalData";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";

/** The journal on screen: this device's when signed out, the signed-in account's otherwise (journalData.ts). */
export function useJournal() {
  const data = useJournalData();
  return { ...data, goals: data.goals ?? DEFAULT_JOURNAL_GOALS };
}

export function shortDate(date: string) {
  return dateFromKey(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function JournalInvitation({ onWrite }: { onWrite: (prompt: string) => void }) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const prompt = REFLECTION_PROMPTS[index];
  return (
    <View
      accessibilityLabel="An invitation to reflect"
      style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.accentNote, padding: 20, gap: 12 }}
    >
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, color: colors.foreground }}>
        Make room for a little light.
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.serif, fontSize: 17, lineHeight: 26, color: colors.foregroundMuted }}>
        {prompt}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button icon="pen" label="Write a reflection" onPress={() => onWrite(prompt)} testID="write-reflection" />
        <Button variant="quiet" label="Choose another prompt" onPress={() => setIndex((value) => (value + 1) % REFLECTION_PROMPTS.length)} />
      </View>
    </View>
  );
}

export function MonthCalendar({
  month,
  onMonth,
  countsByDay,
  today,
  selectedDate,
  onSelectDate,
}: {
  month: string;
  onMonth: (month: string) => void;
  countsByDay: Map<string, number>;
  today: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const { colors } = useTheme();
  const cells = monthGrid(month);
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <View accessibilityLabel="Calendar" style={{ padding: 16, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
          {formatMonthHeading(month)}
        </Text>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => onMonth(shiftMonth(month, -1))} />
        <IconButton icon="chevron-right" label="Next month" onPress={() => onMonth(shiftMonth(month, 1))} />
      </View>
      <View style={{ flexDirection: "row" }}>
        {weekdays.map((day, index) => (
          <Text key={index} accessibilityLabel={weekdayNames[index]} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.foregroundSoft }}>
            {day}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((day, index) => {
          if (!day) return <View key={index} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const count = countsByDay.get(day) ?? 0;
          const selected = day === selectedDate;
          const isToday = day === today;
          const label = `${dateFromKey(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${isToday ? ", today" : ""}${count ? `, ${plural(count, "entry", "entries")}` : ""}`;
          return (
            <View key={day} style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}>
              <Pressable
                testID={`day-${day}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => onSelectDate(day)}
                style={({ pressed }) => ({
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: isToday && !selected ? 1.5 : 0,
                  borderColor: colors.accentRubric,
                  backgroundColor: selected ? colors.surfaceButtonActive : pressed ? colors.surfaceButtonHover : "transparent",
                })}
              >
                <Text style={{ fontFamily: isToday ? fonts.sansBold : fonts.sansMedium, fontSize: 14, color: selected ? colors.surfaceButtonActiveText : colors.foreground }}>
                  {Number(day.slice(8))}
                </Text>
                {count ? (
                  <View style={{ position: "absolute", bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: selected ? colors.surfaceButtonActiveText : colors.accentRubric }} />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Progress({ label, count, target, hint }: { label: string; count: number; target: number; hint: string }) {
  const { colors } = useTheme();
  const pct = Math.min(1, target ? count / target : 0) * 100;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: colors.foreground }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: target, now: Math.min(count, target) }}
          style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceCardSoft, overflow: "hidden" }}
        >
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.accentGoal }} />
        </View>
        <Text accessibilityLabel={`${count} of ${target}`} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.foreground }}>
          {count} <Text style={{ fontFamily: fonts.sans, color: colors.foregroundSoft }}>/ {target}</Text>
        </Text>
      </View>
      <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>{hint}</Txt>
    </View>
  );
}

function Stepper({ label, hint, value, max, onChange }: { label: string; hint: string; value: number; max: number; onChange: (value: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground }}>{label}</Text>
        <Txt style={{ fontSize: 12, color: colors.foregroundSoft }}>{hint}</Txt>
      </View>
      <IconButton icon="minus" label={`Decrease ${label.toLowerCase()}`} disabled={value <= 1} onPress={() => onChange(value - 1)} />
      <Text accessibilityLabel={`${label}: ${value}`} style={{ minWidth: 28, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 18, color: colors.foreground }}>
        {value}
      </Text>
      <IconButton icon="plus" label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

export function JournalGoalsPanel({ entries, today, goals }: { entries: JournalEntry[]; today: string; goals: JournalGoals }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<JournalGoals>(goals);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const progress = journalHomeProgress(entries, today);
  const save = async () => {
    const problem = journalGoalsProblem(draft);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await journalStudy.saveGoals(draft);
      setError(null);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your goals couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ padding: 16, gap: 16, borderTopWidth: 1, borderTopColor: colors.rule }}>
      <View accessibilityLabel="Weekly goals" style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
            Weekly goals
          </Text>
          <Button
            variant="quiet"
            icon="pen"
            label="Edit goals"
            onPress={() => {
              setDraft(goals);
              setError(null);
              setEditing(true);
            }}
          />
        </View>
        <Progress
          label={`Study ${goals.studyDays} ${goals.studyDays === 1 ? "day" : "days"} a week`}
          count={progress.studyDays}
          target={goals.studyDays}
          hint="Days with reading logged, Monday to Sunday"
        />
        <Progress
          label={`Write ${goals.reflections} ${goals.reflections === 1 ? "reflection" : "reflections"} a week`}
          count={progress.reflections}
          target={goals.reflections}
          hint="Notes with your own words this week"
        />
      </View>
      <View accessibilityLabel="This month's study" style={{ gap: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.rule }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
            This month
          </Text>
          <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>{formatMonthHeading(monthKeyOf(today))}</Txt>
        </View>
        <Text style={{ fontFamily: fonts.serif, fontSize: 17, color: colors.foreground }}>{plural(progress.monthStudyDays, "day", "days")} of study</Text>
      </View>
      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit weekly goals">
        <Txt style={{ color: colors.foregroundMuted }}>Choose a rhythm that works for you.</Txt>
        <Stepper label="Study days per week" hint="1–7 days" value={draft.studyDays} max={7} onChange={(studyDays) => setDraft({ ...draft, studyDays })} />
        <Stepper
          label="Reflections per week"
          hint={`1–${MAX_WEEKLY_REFLECTIONS} notes each week`}
          value={draft.reflections}
          max={MAX_WEEKLY_REFLECTIONS}
          onChange={(reflections) => setDraft({ ...draft, reflections })}
        />
        <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>Changing a goal keeps your recorded progress.</Txt>
        {error ? <Txt accessibilityRole="alert" style={{ color: colors.accentRubric }}>{error}</Txt> : null}
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" label="Cancel" onPress={() => setEditing(false)} />
          <Button label={saving ? "Saving…" : "Save goals"} busy={saving} disabled={saving} onPress={() => void save()} />
        </View>
      </Sheet>
    </View>
  );
}

export function JournalRevisit({ entries, before, onOpen }: { entries: JournalEntry[]; before: string; onOpen: (entry: JournalNoteEntry) => void }) {
  const { colors } = useTheme();
  const note = journalRevisit(entries, before);
  if (!note) return null;
  return (
    <View accessibilityLabel="A thought worth revisiting" style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 20, color: colors.foreground }}>
          A thought worth revisiting
        </Text>
        <Txt style={{ fontSize: 13, color: colors.foregroundSoft }}>{shortDate(note.journal_date)}</Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open note: ${note.title || "Untitled note"}`}
        onPress={() => onOpen(note)}
        style={({ pressed }) => ({ padding: 16, gap: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard })}
      >
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.foreground }}>{note.title || "Untitled note"}</Text>
        {note.excerpt ? (
          <Text numberOfLines={3} style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>
            {note.excerpt}
          </Text>
        ) : null}
        <Text style={{ marginTop: 4, fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentSecondary }}>Open note</Text>
      </Pressable>
    </View>
  );
}

export function EntryRow({ entry, onOpen }: { entry: JournalEntry; onOpen: (entry: JournalEntry) => void }) {
  const { colors } = useTheme();
  if (entry.kind === "reading") return <ReadingRow entry={entry} onOpen={onOpen} />;
  const isNote = entry.kind === "note";
  const reading = isNote && !!entry.reading_at;
  const title = isNote ? entry.title : `Verse note · ${entry.source.label}`;
  const excerpt = isNote ? entry.excerpt : entry.body;
  const source = entry.source;
  return (
    <Pressable
      testID={`entry-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}${reading ? ", reading logged" : ""}${source ? `, from ${source.label}` : ""}`}
      onPress={() => onOpen(entry)}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard,
        gap: 4,
      })}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <Icon name={reading ? "book-open" : isNote ? "lightbulb" : "highlighter"} size={13} color={colors.foregroundMuted} style={{ marginTop: 5 }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontWeight: "500", fontSize: 18, lineHeight: 23, color: colors.foreground }}>
            {title}
          </Text>
          {reading ? <Text style={{ marginTop: 2, fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.accentSecondary }}>Reading logged</Text> : null}
          {excerpt ? (
            <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.foregroundMuted }}>
              {excerpt}
            </Text>
          ) : null}
        </View>
      </View>
      {source ? (
        <Text numberOfLines={1} style={{ paddingLeft: 21, fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>
          {`${sourceKindLabel(source)} · ${source.label} · ${formatTime(entryTime(entry))}`}
        </Text>
      ) : (
        <Text style={{ paddingLeft: 21, fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>{`Personal note · ${formatTime(entryTime(entry))}`}</Text>
      )}
    </Pressable>
  );
}

/** A reading logged in the account (on the website) without an entry of its own; opening it makes one. */
function ReadingRow({ entry, onOpen }: { entry: Extract<JournalEntry, { kind: "reading" }>; onOpen: (entry: JournalEntry) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`entry-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Reading logged, ${entry.source.label}`}
      onPress={() => onOpen(entry)}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceCard,
        gap: 4,
      })}
    >
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <Icon name="book-open" size={13} color={colors.foregroundMuted} style={{ marginTop: 5 }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontFamily: fonts.serif, fontWeight: "500", fontSize: 18, lineHeight: 23, color: colors.foreground }}>
            {entry.source.label}
          </Text>
          <Text style={{ marginTop: 2, fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.accentSecondary }}>Reading logged</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ paddingLeft: 21, fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundSoft }}>
        {`${sourceKindLabel(entry.source)} · ${formatTime(entryTime(entry))}`}
      </Text>
    </Pressable>
  );
}

export function sortEntries(entries: JournalEntry[]) {
  return [...entries].sort((a, b) => entryTime(a).localeCompare(entryTime(b)));
}

export { entryKey, localDateKey, Card };
