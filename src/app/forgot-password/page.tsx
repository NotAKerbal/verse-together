import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/PasswordResetForms";

export const metadata: Metadata = { title: "Reset your password · Verse Together" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
