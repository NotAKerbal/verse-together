import type { Metadata } from "next";
import PlansWorkspace from "@/features/plans/PlansWorkspace";

export const metadata: Metadata = {
  title: "Plans · Verse Together",
};

export default function PlansPage() {
  return <PlansWorkspace />;
}
