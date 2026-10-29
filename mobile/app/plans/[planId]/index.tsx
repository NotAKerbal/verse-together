import { useLocalSearchParams } from "expo-router";
import PlanDetailScreen from "../../../src/features/plans/PlanDetailScreen";

export default function PlanRoute() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <PlanDetailScreen key={String(planId)} planId={String(planId)} />;
}
