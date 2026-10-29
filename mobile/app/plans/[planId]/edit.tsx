import { useLocalSearchParams } from "expo-router";
import PlanBuilderScreen from "../../../src/features/plans/PlanBuilderScreen";

export default function EditPlanRoute() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <PlanBuilderScreen key={String(planId)} planId={String(planId)} />;
}
