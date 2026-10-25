import type { Metadata } from "next";
import { Suspense } from "react";
import SignUpForm from "@/features/auth/SignUpForm";

export const metadata: Metadata = { title: "Create an account · Verse Together" };

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
