"use client";

import { useEffect, useState } from "react";
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/nextjs";
import { getIsAdmin } from "@/lib/appData";

type AppUser = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
};

export function useAuth() {
  const { user, isLoaded } = useUser();
  const { getToken, isSignedIn } = useClerkAuth();
  const { openSignIn, signOut } = useClerk();

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
    promptSignIn: () => openSignIn(),
    signOut,
  };
}

export function useAdminStatus() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (loading) return;
      if (!user?.id) {
        setIsAdmin(false);
        setIsAdminLoading(false);
        return;
      }
      setIsAdminLoading(true);
      try {
        const next = await getIsAdmin(user.id);
        if (!cancelled) {
          setIsAdmin(next);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setIsAdminLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  return { isAdmin, isAdminLoading };
}
