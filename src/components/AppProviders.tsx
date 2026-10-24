"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { ComponentProps, PropsWithChildren, useMemo } from "react";
import { AppHeaderSlotProvider } from "@/components/AppHeaderSlot";
import { InsightBuilderProvider } from "@/features/insights/InsightBuilderProvider";
import NotebookPanel from "@/features/insights/NotebookPanel";
import { authClient } from "@/lib/auth-client";
import { AppAuthProvider, UnconfiguredAuthProvider } from "@/lib/auth";

// @convex-dev/better-auth 0.12's AuthClient type no longer matches the client type better-auth >= 1.6.18
// infers (useSession's data narrows to `never`); 1.6.17 typechecks unchanged. The runtime surface the
// provider uses (useSession, convex.token) is identical, so cast at this one boundary instead of
// pinning an older better-auth patch release.
const providerAuthClient = authClient as unknown as ComponentProps<typeof ConvexBetterAuthProvider>["authClient"];

function ConvexAuthProviders({ children }: PropsWithChildren) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

  if (!convex) {
    return <UnconfiguredAuthProvider>{children}</UnconfiguredAuthProvider>;
  }

  return (
    <ConvexBetterAuthProvider client={convex} authClient={providerAuthClient}>
      <AppAuthProvider>{children}</AppAuthProvider>
    </ConvexBetterAuthProvider>
  );
}

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConvexAuthProviders>
      <InsightBuilderProvider>
        <AppHeaderSlotProvider>{children}</AppHeaderSlotProvider>
        <NotebookPanel />
      </InsightBuilderProvider>
    </ConvexAuthProviders>
  );
}
