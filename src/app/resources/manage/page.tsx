import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import ResourceManagerWorkspace from "@/components/ResourceManagerWorkspace";
import { getIsAdmin } from "@/lib/appData";
import { getLocalLdsBooks, getLocalLdsVolumes } from "@/lib/ldsLocalData.server";

export default async function ResourceManagerPage() {
  const authState = await auth();
  const clerkId = authState.userId;

  if (!clerkId) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Resource Manager</h1>
        <p className="text-sm text-foreground/70">
          Sign in with an admin account to manage curated resources.
        </p>
      </main>
    );
  }

  const isAdmin = await getIsAdmin(clerkId);
  if (!isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Resource Manager</h1>
        <p className="text-sm text-foreground/70">
          This page is only available to admins.
        </p>
        <Link
          href="/browse"
          className="inline-flex w-fit rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15"
        >
          Back to browse
        </Link>
      </main>
    );
  }

  const volumes = await getLocalLdsVolumes();
  const booksByVolumeEntries = await Promise.all(
    volumes.map(async (volume) => [volume.id, await getLocalLdsBooks(volume.id)] as const)
  );
  const booksByVolume = Object.fromEntries(booksByVolumeEntries);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Resource Manager</h1>
          <p className="text-sm text-foreground/70">
            Browse to a book, select chapter coverage or open a chapter to select verses, then attach that selection to a curated resource.
          </p>
        </div>
        <Link
          href="/browse"
          className="inline-flex w-fit rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15"
        >
          Back to browse
        </Link>
      </div>
      <ResourceManagerWorkspace volumes={volumes} booksByVolume={booksByVolume} />
    </main>
  );
}
