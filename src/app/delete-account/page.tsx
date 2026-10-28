import type { Metadata } from "next";
import DeleteAccount from "@/features/auth/DeleteAccount";

export const metadata: Metadata = {
  title: "Delete your account · Verse Together",
  description: "Permanently delete your Verse Together account and the study saved in it.",
};

export default function DeleteAccountPage() {
  return <DeleteAccount />;
}
