"use client";

import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/nextjs";

type AppUser = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
};

export function useAuth() {
  const { user, isLoaded } = useUser();
  const { getToken, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();

  const appUser: AppUser | null = user
    ? {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        fullName: user.fullName ?? null,
        imageUrl: user.imageUrl ?? null,
      }
    : null;

  return {
    session: isSignedIn ? { user: appUser } : null,
    user: appUser,
    loading: !isLoaded,
    getToken,
    signOut,
  };
}


