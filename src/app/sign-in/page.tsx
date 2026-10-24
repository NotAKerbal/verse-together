import type { Metadata } from "next";
import { Suspense } from "react";
import SignInForm from "@/features/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in · Verse Together" };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
