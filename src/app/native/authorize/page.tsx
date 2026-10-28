import type { Metadata } from "next";
import { Suspense } from "react";
import NativeAuthorize from "@/features/auth/NativeAuthorize";

export const metadata: Metadata = { title: "Sign in to the desktop app · Verse Together", robots: { index: false } };

export default function NativeAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <NativeAuthorize />
    </Suspense>
  );
}
