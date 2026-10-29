// Study plans (the web's PlansWorkspace.tsx): the signed-in account's plans with their progress and pace, each
// opened, edited or deleted (after confirming; read chapters are kept), and a new one started. Signed out: the web's
// "Sign in to keep a plan".

import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { describePlanPace, describeReadingDays, normalizeReadingDays } from "@/features/plans/planSchedule";
import { Button, Card, IconButton, Page, Serif, Txt } from "../../components/ui";
import { useTheme } from "../../theme/theme";
import { ErrorText, NotLoaded, PageHero, PlansAccessNotice, PlansHeader, ProgressBar, Tag } from "./PlanParts";
import { planActions, planErrorMessage, useMyPlans, usePlansAccess, type PlanSummary } from "./planData";

/** Asks before deleting, as the web does; resolves true once confirmed. */
export function confirmDeletePlan(title: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(`Delete "${title}"?`, "Chapters you've marked read are kept.", [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete plan", style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

function PlanCard({ plan, deleting, onDelete }: { plan: PlanSummary; deleting: boolean; onDelete: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const percent = plan.stepCount ? Math.round((plan.readCount / plan.stepCount) * 100) : 0;
  const href = `/plans/${plan.id}`;
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Tag>{describeReadingDays(normalizeReadingDays(plan.readingDays))}</Tag>
            {percent === 100 ? <Tag background={colors.accentMint}>Done</Tag> : null}
          </View>
          <Serif accessibilityRole="link" onPress={() => router.push(href as never)} style={{ fontSize: 20, lineHeight: 25 }}>
            {plan.title}
          </Serif>
        </View>
        <IconButton icon="trash" label={`Delete plan ${plan.title}`} disabled={deleting} onPress={onDelete} />
      </View>
      <ProgressBar value={plan.readCount} max={plan.stepCount} label={`${plan.readCount} of ${plan.stepCount} chapters read`} />
      <Txt style={{ fontSize: 12.5, lineHeight: 18, color: colors.foregroundMuted }}>{describePlanPace(plan)}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button variant="secondary" label="Open plan" onPress={() => router.push(href as never)} />
        <Button variant="secondary" label="Edit" accessibilityLabel={`Edit ${plan.title}`} onPress={() => router.push(`${href}/edit` as never)} />
      </View>
    </Card>
  );
}

export default function PlansScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const access = usePlansAccess();
  const calls = access.kind === "account" ? access.calls : null;
  const plans = useMyPlans(calls);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (plan: PlanSummary) => {
    if (!calls || !(await confirmDeletePlan(plan.title))) return;
    setDeletingId(plan.id);
    setError(null);
    try {
      await planActions(calls).deletePlan(plan.id);
    } catch (problem) {
      setError(planErrorMessage(problem, "Couldn't delete that plan. Try again in a moment."));
    } finally {
      setDeletingId(null);
    }
  };

  const notice = <PlansAccessNotice access={access} />;
  const blocked = access.kind !== "account" || !access.calls;
  return (
    <Page withNav={false} gap={18} testID="plans-screen">
      <PlansHeader title="Plans" fallback="/browse" />
      <PageHero eyebrow="Study plans" title="Plans" subtitle="Line up chapters, pace them across days, and watch the book and chapter grids fill in as you read." />
      {blocked ? (
        notice
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 4 }}>
            <Serif accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
              My plans
            </Serif>
            <Button icon="plus" label="New plan" onPress={() => router.push("/plans/new")} />
          </View>
          {error ? <ErrorText>{error}</ErrorText> : null}
          {plans.value === undefined ? (
            <NotLoaded online={plans.online} failed={plans.failed} loading="Loading your plans…" />
          ) : !plans.value || plans.value.length === 0 ? (
            <Card soft style={{ padding: 20, gap: 12 }}>
              <Txt style={{ fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>
                No plans yet. Pick a volume, a few books, or a chapter range, set a pace, and it will show up here.
              </Txt>
              <Button variant="secondary" label="Build your first plan" style={{ alignSelf: "flex-start" }} onPress={() => router.push("/plans/new")} />
            </Card>
          ) : (
            plans.value.map((plan) => <PlanCard key={plan.id} plan={plan} deleting={deletingId === plan.id} onDelete={() => void remove(plan)} />)
          )}
        </View>
      )}
    </Page>
  );
}
