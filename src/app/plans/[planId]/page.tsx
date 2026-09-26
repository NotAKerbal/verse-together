import PlanDetail from "@/features/plans/PlanDetail";

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <PlanDetail planId={planId} />;
}
