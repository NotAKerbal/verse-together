// One study plan (the web's PlanDetail.tsx): today's reading by the plan's calendar, every chapter grouped by
// reading day, each checked off (or unchecked) as the account's read chapters, and editing or deleting the plan.

import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { buildPlanSchedule, describePlanPace, describeReadingDays, formatDateKey, normalizeReadingDays } from "./planSchedule";
import { Button, Card, Icon, Page, Serif, Txt } from "../../components/ui";
import { chapterPath } from "../../navigation/hrefs";
import { useTheme } from "../../theme/theme";
import { fonts, radii } from "../../theme/tokens";
import { ErrorText, NotLoaded, PageHero, PlansAccessNotice, PlansHeader, ProgressBar, SubLabel, Tag } from "./PlanParts";
import { confirmDeletePlan } from "./PlansScreen";
import { planActions, planErrorMessage, usePlan, usePlansAccess, type PlanStepWithState } from "./planData";

function StepRow({ step, pending, highlight, onToggle }: { step: PlanStepWithState; pending: boolean; highlight: boolean; onToggle: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const read = !!step.readAt;
  return (
    <View
      testID={`plan-step-${step.index}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.surfaceBorder,
        backgroundColor: read ? colors.accentMint : highlight ? colors.accentNote : colors.surfaceCard,
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${read ? "Unmark" : "Mark"} ${step.label} as read`}
        accessibilityState={{ checked: read, disabled: pending, busy: pending }}
        disabled={pending}
        hitSlop={6}
        onPress={onToggle}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: read ? colors.surfaceButtonActive : colors.surfaceCard,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {read ? <Icon name="check" size={13} color={colors.surfaceButtonActiveText} /> : null}
      </Pressable>
      <Text
        accessibilityRole="link"
        numberOfLines={1}
        onPress={() => router.push(chapterPath(step.volume, step.book, step.chapter) as never)}
        style={{ flex: 1, minHeight: 32, textAlignVertical: "center", paddingVertical: 6, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.foreground }}
      >
        {step.label}
      </Text>
      {read ? <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: colors.foregroundMuted }}>Read</Text> : null}
    </View>
  );
}

export default function PlanDetailScreen({ planId }: { planId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const access = usePlansAccess();
  const calls = access.kind === "account" ? access.calls : null;
  const plan = usePlan(calls, planId);
  const [pendingSteps, setPendingSteps] = useState<ReadonlySet<number>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = plan.value;
  const schedule = useMemo(() => (value ? buildPlanSchedule(value) : null), [value]);

  const toggle = async (step: PlanStepWithState) => {
    if (!calls || pendingSteps.has(step.index)) return;
    setPendingSteps((previous) => new Set(previous).add(step.index));
    setError(null);
    try {
      const actions = planActions(calls);
      await (step.readAt ? actions.unmarkChapterRead(step) : actions.markChapterRead(step));
    } catch (problem) {
      setError(planErrorMessage(problem, "Couldn't update that chapter. Try again in a moment."));
    } finally {
      setPendingSteps((previous) => {
        const next = new Set(previous);
        next.delete(step.index);
        return next;
      });
    }
  };

  const remove = async () => {
    if (!calls || !value || deleting || !(await confirmDeletePlan(value.title))) return;
    setDeleting(true);
    setError(null);
    try {
      await planActions(calls).deletePlan(value.id);
      router.replace("/plans");
    } catch (problem) {
      setError(planErrorMessage(problem, "Couldn't delete the plan. Try again in a moment."));
      setDeleting(false);
    }
  };

  const header = <PlansHeader title={value?.title ?? "Plan"} fallback="/plans" />;
  if (access.kind !== "account" || !access.calls) {
    return (
      <Page withNav={false} gap={18}>
        {header}
        <PlansAccessNotice access={access} />
      </Page>
    );
  }
  if (value === undefined) {
    return (
      <Page withNav={false} gap={18}>
        {header}
        <NotLoaded online={plan.online} failed={plan.failed} loading="Loading plan…" />
      </Page>
    );
  }
  if (value === null || !schedule) {
    return (
      <Page withNav={false} gap={18}>
        {header}
        <Card style={{ padding: 20, gap: 8 }}>
          <Serif accessibilityRole="header" style={{ fontSize: 21, lineHeight: 26 }}>
            Plan not found
          </Serif>
          <Txt style={{ fontSize: 14, color: colors.foregroundMuted }}>It may have been deleted, or the link is wrong.</Txt>
          <Button variant="secondary" label="All plans" style={{ alignSelf: "flex-start", marginTop: 6 }} onPress={() => router.replace("/plans")} />
        </Card>
      </Page>
    );
  }

  const percent = value.stepCount ? Math.round((value.readCount / value.stepCount) * 100) : 0;
  const renderStep = (step: PlanStepWithState, highlight: boolean, prefix: string) => (
    <StepRow key={`${prefix}-${step.index}`} step={step} pending={pendingSteps.has(step.index)} highlight={highlight} onToggle={() => void toggle(step)} />
  );
  const edit = () => router.push(`/plans/${value.id}/edit` as never);
  return (
    <Page withNav={false} gap={18} testID="plan-detail">
      {header}
      <PageHero title={value.title} subtitle={describePlanPace(value)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Tag>{describeReadingDays(normalizeReadingDays(value.readingDays))}</Tag>
          <Tag background={percent === 100 ? colors.accentMint : colors.accentPrimary}>{`${percent}% read`}</Tag>
          <Button variant="secondary" label="Edit plan" onPress={edit} />
        </View>
        <ProgressBar value={value.readCount} max={value.stepCount} label={`${value.readCount} of ${value.stepCount} chapters read`} />
      </PageHero>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!plan.online ? <ErrorText>You’re offline. Checking off chapters works again once you’re connected.</ErrorText> : null}
      <Card soft style={{ padding: 16, gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Serif accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25 }}>
            {schedule.todayTitle}
          </Serif>
          {schedule.todayNote ? <Txt style={{ fontSize: 13.5, color: colors.foregroundMuted }}>{schedule.todayNote}</Txt> : null}
        </View>
        {schedule.todaySteps.map((step) => renderStep(step, true, "today"))}
      </Card>
      <Card style={{ padding: 16, gap: 14 }}>
        <Serif accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25 }}>
          All chapters
        </Serif>
        {schedule.groups
          ? schedule.groups.map((group) => (
              <View key={group.day} accessibilityLabel={`Day ${group.day + 1}`} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Tag background={group.isToday ? colors.accentPrimary : colors.surfaceCard}>{`Day ${group.day + 1}`}</Tag>
                  {group.date ? <SubLabel>{formatDateKey(group.date)}</SubLabel> : null}
                  {group.isToday ? <SubLabel>Today</SubLabel> : null}
                </View>
                {group.steps.map((step) => renderStep(step, group.isToday, "all"))}
              </View>
            ))
          : value.steps.map((step) => renderStep(step, false, "all"))}
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="secondary" label="Edit plan" onPress={edit} />
        <Button variant="danger" icon="trash" label={deleting ? "Deleting…" : "Delete plan"} busy={deleting} disabled={deleting} onPress={() => void remove()} />
      </View>
    </Page>
  );
}
