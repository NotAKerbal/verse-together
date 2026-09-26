import type { Metadata } from "next";
import PlanBuilder from "@/features/plans/PlanBuilder";

export const metadata: Metadata = {
  title: "Edit plan · Verse Together",
};

export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <PlanBuilder planId={planId} />;
}
