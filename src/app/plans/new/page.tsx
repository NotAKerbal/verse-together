import type { Metadata } from "next";
import PlanBuilder from "@/features/plans/PlanBuilder";

export const metadata: Metadata = {
  title: "New plan · Verse Together",
};

export default function NewPlanPage() {
  return <PlanBuilder />;
}
