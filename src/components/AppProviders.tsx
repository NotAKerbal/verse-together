"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { PropsWithChildren, useMemo } from "react";
import { InsightBuilderProvider } from "@/features/insights/InsightBuilderProvider";
import InsightBuilderShell from "@/features/insights/InsightBuilderShell";

function ConvexClerkProvider({ children }: PropsWithChildren) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

  if (!convex) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ClerkProvider>
      <ConvexClerkProvider>
        <InsightBuilderProvider>
          {children}
          <InsightBuilderShell />
        </InsightBuilderProvider>
      </ConvexClerkProvider>
    </ClerkProvider>
  );
}
