"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient, ConvexProviderWithAuth } from "convex/react";
import { ComponentProps, PropsWithChildren, useMemo } from "react";
import { AppHeaderSlotProvider } from "@/components/AppHeaderSlot";
import { InsightBuilderProvider } from "@/features/insights/InsightBuilderProvider";
import { DeviceSyncProvider } from "@/features/notes/DeviceSyncStatus";
import NotebookPanel from "@/features/insights/NotebookPanel";
import { authClient } from "@/lib/auth-client";
import { AppAuthProvider, UnconfiguredAuthProvider } from "@/lib/auth";

// @convex-dev/better-auth 0.12's AuthClient type no longer matches the client type better-auth >= 1.6.18
// infers (useSession's data narrows to `never`); 1.6.17 typechecks unchanged. The runtime surface the
// provider uses (useSession, convex.token) is identical, so cast at this one boundary instead of
// pinning an older better-auth patch release.
const providerAuthClient = authClient as unknown as ComponentProps<typeof ConvexBetterAuthProvider>["authClient"];

const localAuth = { isLoading: false, isAuthenticated: false, fetchAccessToken: async () => null };
function useLocalAuth() {
  return localAuth;
}

function ConvexAuthProviders({ children }: PropsWithChildren) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    return new ConvexReactClient(url || "http://127.0.0.1:1", { skipConvexDeploymentUrlCheck: !url });
  }, []);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <ConvexProviderWithAuth client={convex} useAuth={useLocalAuth}>
        <UnconfiguredAuthProvider>{children}</UnconfiguredAuthProvider>
      </ConvexProviderWithAuth>
    );
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
      <DeviceSyncProvider>
        <InsightBuilderProvider>
          <AppHeaderSlotProvider>{children}</AppHeaderSlotProvider>
          <NotebookPanel />
        </InsightBuilderProvider>
      </DeviceSyncProvider>
    </ConvexAuthProviders>
  );
}
