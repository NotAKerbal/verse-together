// A new or edited study plan (the web's PlanBuilder.tsx): what to read (whole volumes, books, or a book narrowed to a
// chapter range, in the order added), how fast (chapters per day, a number of reading days, or a finish date; the
// other two follow), which weekdays, from when, and a title (automatic until changed). Quick starts fill it in.
// Saving sends the plan to the account; editing rebuilds only the schedule, and read chapters stay read.

import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { WEEKDAY_LABELS, countReadingDaysPerWeek, formatShortDateKey, parseDateKey, pluralize } from "./planSchedule";
import { VOLUME_SHORT_LABELS, countSelectionChapters, describeSelection, getVolumeChapterCount, type PlanSelection, type PlanVolumeId } from "./planScope";
import { findCatalogBook, getChapterDelineation } from "@/features/reading/scriptureCatalog";
import { getCatalogBooks } from "./planCatalog";
import { Button, Card, IconButton, Page, Serif, Txt } from "../../components/ui";
import { useFaithTradition } from "../../storage/faithTradition";
import { useTheme } from "../../theme/theme";
import { fonts, radii } from "../../theme/tokens";
import {
  VOLUME_TAB_LABELS,
  addBook,
  clamp,
  describeFirstDay,
  evaluateBuilder,
  findBookSelection,
  freshState,
  planVolumesFor,
  quickStartsFor,
  replaceBookSelection,
  setBookRange,
  shiftDateKey,
  stateFromPlan,
  toggleVolume,
  toggleWeekday,
  volumeSelected,
  type BuilderState,
  type PaceDriver,
  type ResolvedPace,
} from "./builderState";
import { Chip, ErrorText, NotLoaded, PageHero, PlansAccessNotice, PlansHeader, StepHeading, SubLabel } from "./PlanParts";
import { planActions, planSaveMessage, usePlan, usePlansAccess, type PlanDetailData } from "./planData";

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (next: number) => {
    if (Number.isFinite(next)) onChange(clamp(Math.round(next), min, max));
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, backgroundColor: colors.surfaceCard, padding: 2 }}>
      <IconButton icon="minus" label={`Decrease ${label}`} size={40} disabled={value <= min} onPress={() => commit(value - 1)} />
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={draft ?? String(value)}
        onChangeText={(text) => {
          setDraft(text);
          const parsed = Number(text);
          if (text !== "" && Number.isFinite(parsed)) commit(parsed);
        }}
        onBlur={() => setDraft(null)}
        style={{ width: 56, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 18, color: colors.foreground, paddingVertical: 6 }}
      />
      <IconButton icon="plus" label={`Increase ${label}`} size={40} disabled={value >= max} onPress={() => commit(value + 1)} />
    </View>
  );
}

/** A date as YYYY-MM-DD, typed or moved a day at a time (the web's date input). */
function DateField({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  const valid = !!parseDateKey(value);
  const atMin = !!min && valid && value <= min;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, backgroundColor: colors.inputSurface, padding: 2 }}>
        <IconButton icon="chevron-left" label={`${label}: a day earlier`} size={40} disabled={!valid || atMin} onPress={() => onChange(shiftDateKey(value, -1))} />
        <TextInput
          accessibilityLabel={`${label} (year-month-day)`}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.foregroundSoft}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          value={value}
          onChangeText={onChange}
          style={{ width: 116, textAlign: "center", fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground, paddingVertical: 6 }}
        />
        <IconButton
          icon="chevron-right"
          label={`${label}: a day later`}
          size={40}
          disabled={!valid && !min}
          onPress={() => onChange(valid ? shiftDateKey(value, 1) : min!)}
        />
      </View>
      {valid ? <Txt style={{ fontSize: 12.5, color: colors.foregroundMuted }}>{formatShortDateKey(value)}</Txt> : null}
    </View>
  );
}

function ScopeStep({ selections, onChange }: { selections: PlanSelection[]; onChange: (next: PlanSelection[]) => void }) {
  const { colors } = useTheme();
  const { showLdsContent } = useFaithTradition();
  const volumes = planVolumesFor(showLdsContent);
  const [selectedVolume, setSelectedVolume] = useState<PlanVolumeId>("bookofmormon");
  // Other denominations: the Bible's volumes only, as the web's builder.
  const activeVolume = volumes.includes(selectedVolume) ? selectedVolume : "newtestament";
  const [narrowing, setNarrowing] = useState<{ volume: string; book: string } | null>(null);

  const activeSelected = volumeSelected(selections, activeVolume);
  const books = getCatalogBooks(activeVolume);
  const entry = narrowing ? findCatalogBook(narrowing.volume, narrowing.book) : null;
  const narrowed = narrowing ? findBookSelection(selections, narrowing.volume, narrowing.book) : null;
  const showStrip = !!(narrowing && entry && narrowed && normalizeScriptureVolume(narrowing.volume) === activeVolume);
  const stripFrom = narrowed?.kind === "range" ? (narrowed.from ?? 1) : 1;
  const stripTo = narrowed?.kind === "range" ? (narrowed.to ?? stripFrom) : (entry?.chapters ?? 1);

  const tapBook = (volume: string, book: string) => {
    if (!findBookSelection(selections, volume, book)) {
      onChange(addBook(selections, volume, book));
      setNarrowing(null);
      return;
    }
    setNarrowing((previous) => (previous && previous.volume === volume && previous.book === book ? null : { volume, book }));
  };

  return (
    <Card style={{ padding: 16, gap: 18 }}>
      <StepHeading number={1} title="What to read" hint="Tap a whole volume, or pick books and narrow any of them to a chapter range. Everything reads in the order you add it." />
      <View style={{ gap: 8 }}>
        <SubLabel>Whole volume</SubLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {volumes.map((volume) => (
            <Chip
              key={volume}
              label={VOLUME_SHORT_LABELS[volume]}
              meta={String(getVolumeChapterCount(volume))}
              on={volumeSelected(selections, volume)}
              accessibilityLabel={`Whole ${VOLUME_SHORT_LABELS[volume]}, ${getVolumeChapterCount(volume)} chapters`}
              onPress={() => {
                onChange(toggleVolume(selections, volume));
                if (narrowing && normalizeScriptureVolume(narrowing.volume) === volume) setNarrowing(null);
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <SubLabel>Or pick books</SubLabel>
        <View accessibilityRole="tablist" accessibilityLabel="Volume to pick books from" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {volumes.map((volume) => {
            const active = activeVolume === volume;
            return (
              <Pressable
                key={volume}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedVolume(volume)}
                style={{ minHeight: 38, justifyContent: "center", paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: active ? colors.surfaceButtonActive : colors.surfaceCard }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: active ? colors.surfaceButtonActiveText : colors.foreground }}>{VOLUME_TAB_LABELS[volume]}</Text>
              </Pressable>
            );
          })}
        </View>
        {activeSelected ? (
          <Txt style={{ fontSize: 13.5, lineHeight: 20, color: colors.foregroundMuted }}>
            {`The whole ${VOLUME_SHORT_LABELS[activeVolume]} is in this plan. Untap it above to pick individual books.`}
          </Txt>
        ) : null}
        <View accessibilityLabel={`${VOLUME_SHORT_LABELS[activeVolume]} books`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {books.map((book) => {
            const selection = activeSelected ? null : findBookSelection(selections, book.volume, book.book);
            const range = selection?.kind === "range" ? selection : null;
            const open = narrowing?.volume === book.volume && narrowing?.book === book.book;
            return (
              <Chip
                key={book.book}
                label={book.label}
                meta={range ? `${range.from}–${range.to}` : String(book.chapters)}
                on={activeSelected || !!selection}
                disabled={activeSelected}
                expanded={selection ? open : undefined}
                background={activeSelected ? colors.accentMint : range ? colors.accentPrimary : selection ? colors.accentSkySoft : undefined}
                accessibilityLabel={`${book.label}, ${range ? `chapters ${range.from} to ${range.to}` : `${book.chapters} chapters`}${selection ? ", in plan; tap to narrow" : ""}`}
                onPress={() => tapBook(book.volume, book.book)}
              />
            );
          })}
        </View>
        {showStrip && entry && narrowing ? (
          <View testID="narrow-strip" style={{ gap: 12, padding: 12, borderRadius: radii.card, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.accentNote }}>
            <View>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.foreground }}>{`Narrow ${entry.label}`}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.foregroundMuted }}>{`${getChapterDelineation(entry.volume)}s 1–${entry.chapters}`}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
              <View style={{ gap: 4 }}>
                <SubLabel>From</SubLabel>
                <Stepper
                  key={`${entry.book}-from`}
                  label={`first ${getChapterDelineation(entry.volume).toLowerCase()}`}
                  value={stripFrom}
                  min={1}
                  max={entry.chapters}
                  onChange={(from) => onChange(setBookRange(selections, entry.volume, entry.book, from, Math.max(from, stripTo)))}
                />
              </View>
              <View style={{ gap: 4 }}>
                <SubLabel>To</SubLabel>
                <Stepper
                  key={`${entry.book}-to`}
                  label={`last ${getChapterDelineation(entry.volume).toLowerCase()}`}
                  value={stripTo}
                  min={stripFrom}
                  max={entry.chapters}
                  onChange={(to) => onChange(setBookRange(selections, entry.volume, entry.book, stripFrom, to))}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {narrowed?.kind === "range" ? (
                <Button variant="secondary" label="Whole book" onPress={() => onChange(setBookRange(selections, entry.volume, entry.book, 1, entry.chapters))} />
              ) : null}
              <Button
                variant="secondary"
                label="Remove"
                accessibilityLabel={`Remove ${entry.label}`}
                onPress={() => {
                  onChange(replaceBookSelection(selections, entry.volume, entry.book, null));
                  setNarrowing(null);
                }}
              />
              <Button label="Done" onPress={() => setNarrowing(null)} />
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function PaceStep({ state, pace, stepCount, onChange }: { state: BuilderState; pace: ResolvedPace; stepCount: number; onChange: (patch: Partial<BuilderState>) => void }) {
  const { colors } = useTheme();
  const summary = pace.summary;
  const cards: Array<{ driver: PaceDriver; label: string; value: string; note: string }> = [
    { driver: "perDay", label: "Chapters per day", value: summary ? String(summary.chaptersPerDay) : "–", note: "Fix the daily amount" },
    { driver: "days", label: "Reading days", value: summary ? String(summary.dayCount) : "–", note: "Fix how many sittings" },
    { driver: "finishBy", label: "Finish by", value: summary?.endDate ? formatShortDateKey(summary.endDate) : "–", note: "Fix the end date" },
  ];
  const perWeek = countReadingDaysPerWeek(state.readingDays);
  return (
    <Card style={{ padding: 16, gap: 18 }}>
      <StepHeading number={2} title="How fast" hint="Choose the one number you care about. The other two follow from it." />
      <View accessibilityRole="radiogroup" accessibilityLabel="Pace driver" style={{ gap: 8 }}>
        {cards.map((card) => {
          const active = state.driver === card.driver;
          const ink = active ? "#17161a" : colors.foreground;
          return (
            <Pressable
              key={card.driver}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${card.label}: ${card.value}`}
              onPress={() => onChange({ driver: card.driver })}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.card, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: active ? colors.accentPrimary : colors.surfaceCard }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: active ? ink : colors.foregroundSoft }}>{card.label}</Text>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: ink }}>{card.value}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "rgba(23,22,26,0.7)" : colors.foregroundMuted }}>{active ? "Driving the schedule" : card.note}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 8 }}>
        {state.driver === "perDay" ? (
          <>
            <SubLabel>Chapters per day</SubLabel>
            <Stepper label="chapters per day" value={state.perDay} min={1} max={Math.max(1, stepCount)} onChange={(perDay) => onChange({ perDay })} />
          </>
        ) : state.driver === "days" ? (
          <>
            <SubLabel>Reading days</SubLabel>
            <Stepper label="reading days" value={state.targetDays} min={1} max={Math.max(1, stepCount)} onChange={(targetDays) => onChange({ targetDays })} />
            {summary && summary.dayCount !== state.targetDays && stepCount > 0 ? (
              <Txt style={{ fontSize: 12.5, color: colors.foregroundMuted }}>{`At ${summary.chaptersPerDay} a day it actually wraps up in ${pluralize(summary.dayCount, "reading day")}.`}</Txt>
            ) : null}
          </>
        ) : (
          <>
            <SubLabel>Finish by</SubLabel>
            <DateField label="Finish by" value={state.finishBy} min={state.startDate} onChange={(finishBy) => onChange({ finishBy })} />
          </>
        )}
        {pace.issue ? <Txt style={{ fontSize: 13.5, color: colors.accentRubric }}>{pace.issue}</Txt> : null}
      </View>
      <View style={{ gap: 8 }}>
        <SubLabel>{`Reading days · ${perWeek === 7 ? "every day" : `${perWeek} a week`}`}</SubLabel>
        <View accessibilityLabel="Reading days of the week" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {WEEKDAY_LABELS.map((label, index) => {
            const on = state.readingDays[index];
            return (
              <Pressable
                key={label}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: on }}
                onPress={() => onChange({ readingDays: toggleWeekday(state.readingDays, index) })}
                style={{ width: 46, height: 40, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surfaceButtonActive : colors.surfaceCard }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: on ? colors.surfaceButtonActiveText : colors.foregroundMuted }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SubLabel>Start date</SubLabel>
        <DateField label="Start date" value={state.startDate} onChange={(startDate) => onChange({ startDate })} />
      </View>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: "45%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.card, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 19, color: colors.foreground }}>{value}</Text>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: colors.foregroundMuted }}>{label}</Text>
    </View>
  );
}

function PlanBuilderForm({ plan, onSaved }: { plan: PlanDetailData | null; onSaved: (id: string) => void }) {
  const { colors } = useTheme();
  const { showLdsContent } = useFaithTradition();
  const access = usePlansAccess();
  const calls = access.kind === "account" ? access.calls : null;
  const [state, setState] = useState<BuilderState>(() => (plan ? stateFromPlan(plan) : freshState()));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useMemo(() => evaluateBuilder(state), [state]);
  const { steps, pace, title, issues } = form;
  const summary = pace.summary;
  const perWeek = countReadingDaysPerWeek(state.readingDays);
  const preview = summary
    ? `Day 1 is ${describeFirstDay(steps.slice(0, summary.chaptersPerDay))}. ${pluralize(summary.calendarDays ?? summary.dayCount, "calendar day")} with ${perWeek === 7 ? "reading every day" : `${perWeek} reading ${perWeek === 1 ? "day" : "days"} a week`}.`
    : "Pick something to read and the schedule will fill in here.";

  const patch = (next: Partial<BuilderState>) => {
    setState((previous) => ({ ...previous, ...next }));
    setServerError(null);
  };

  const submit = async () => {
    if (saving) return;
    setAttempted(true);
    if (issues.length > 0 || !calls) return;
    setSaving(true);
    setServerError(null);
    try {
      const actions = planActions(calls);
      const { id } = plan ? await actions.updatePlan(plan.id, form.input) : await actions.createPlan(form.input);
      onSaved(id);
    } catch (error) {
      setServerError(planSaveMessage(error));
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <ScopeStep selections={state.selections} onChange={(selections) => patch({ selections })} />
      <PaceStep state={state} pace={pace} stepCount={steps.length} onChange={patch} />
      <Card style={{ padding: 16, gap: 14, backgroundColor: colors.accentNote }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: colors.foregroundMuted }}>{`Plan title${state.titleOverride === null ? " · auto" : ""}`}</Text>
          <TextInput
            accessibilityLabel="Plan title"
            maxLength={120}
            value={title}
            placeholder="Name this plan"
            placeholderTextColor={colors.foregroundSoft}
            onChangeText={(value) => patch({ titleOverride: value })}
            style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.foreground, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder, paddingVertical: 4 }}
          />
        </View>
        {state.selections.length > 0 ? (
          <View accessibilityLabel="Selections in reading order" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {state.selections.map((selection, index) => {
              const label = describeSelection(selection);
              return (
                <View key={`${selection.kind}-${selection.volume}-${selection.book ?? ""}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surfaceCard }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.foreground }}>{label}</Text>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.foregroundMuted }}>{countSelectionChapters(selection)}</Text>
                  <IconButton icon="xmark" size={32} label={`Remove ${label}`} onPress={() => patch({ selections: state.selections.filter((_, i) => i !== index) })} />
                </View>
              );
            })}
          </View>
        ) : (
          <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>Nothing picked yet.</Txt>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Stat value={String(steps.length)} label="Chapters" />
          <Stat value={summary ? String(summary.chaptersPerDay) : "–"} label="Per reading day" />
          <Stat value={summary ? String(summary.dayCount) : "–"} label="Reading days" />
          <Stat value={summary?.endDate ? formatShortDateKey(summary.endDate) : "–"} label="Finishes" />
        </View>
        <Txt style={{ fontSize: 14, lineHeight: 20 }}>{preview}</Txt>
        {attempted && issues.length ? <ErrorText>{issues.join("\n")}</ErrorText> : null}
        {serverError ? <ErrorText>{serverError}</ErrorText> : null}
        <Button label={saving ? "Saving…" : plan ? "Save changes" : "Start this plan"} busy={saving} disabled={saving || !calls} onPress={() => void submit()} />
        {plan ? <Txt style={{ fontSize: 12.5, color: colors.foregroundMuted }}>Chapters you’ve already read stay read. Only the schedule is rebuilt.</Txt> : null}
      </Card>
      <Card style={{ padding: 16, gap: 10 }}>
        <Serif accessibilityRole="header" style={{ fontSize: 18, lineHeight: 23 }}>
          Quick starts
        </Serif>
        {quickStartsFor(showLdsContent).map((quickStart) => (
          <Pressable
            key={quickStart.id}
            accessibilityRole="button"
            accessibilityLabel={`${quickStart.label}. ${quickStart.hint}`}
            onPress={() => setState((previous) => quickStart.apply(previous))}
            style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.card, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: pressed ? colors.surfaceButtonHover : colors.surfaceButton })}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.foreground }}>{quickStart.label}</Text>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.foregroundMuted }}>{quickStart.hint}</Text>
          </Pressable>
        ))}
        <Txt style={{ fontSize: 12.5, color: colors.foregroundMuted }}>These fill in the builder. Tweak anything before you start.</Txt>
      </Card>
    </View>
  );
}

export default function PlanBuilderScreen({ planId }: { planId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const editing = !!planId;
  const access = usePlansAccess();
  const calls = access.kind === "account" ? access.calls : null;
  const plan = usePlan(calls, planId ?? null);
  const ready = access.kind === "account" && !!access.calls;
  let content;
  if (!ready) content = <PlansAccessNotice access={access} />;
  else if (editing && plan.value === undefined) content = <NotLoaded online={plan.online} failed={plan.failed} loading="Loading plan…" />;
  else if (editing && plan.value === null) {
    content = (
      <Card style={{ padding: 20, gap: 8 }}>
        <Serif accessibilityRole="header" style={{ fontSize: 21, lineHeight: 26 }}>
          Plan not found
        </Serif>
        <Txt style={{ fontSize: 14, color: colors.foregroundMuted }}>It may have been deleted, or the link is wrong.</Txt>
      </Card>
    );
  } else {
    content = (
      <PlanBuilderForm
        key={plan.value?.id ?? "new"}
        plan={editing ? (plan.value ?? null) : null}
        onSaved={(id) => router.replace(`/plans/${id}` as never)}
      />
    );
  }
  return (
    <Page withNav={false} gap={18} testID="plan-builder">
      <PlansHeader title={editing ? "Edit plan" : "New plan"} fallback={editing ? `/plans/${planId}` : "/plans"} />
      <PageHero
        eyebrow="Study plans"
        title={editing ? "Edit plan" : "New plan"}
        subtitle={
          editing
            ? "Change what you're reading or how fast. Your read chapters stay put."
            : "Two steps: what to read, then how fast. A whole volume, a handful of books, or one chapter range, it all works."
        }
      />
      {content}
    </Page>
  );
}
