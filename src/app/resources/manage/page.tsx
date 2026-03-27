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
      <main className="page-shell py-2 sm:py-4">
        <p className="panel-card rounded-[1.35rem] p-4 text-sm text-foreground/70">
          Sign in with an admin account to manage curated resources.
        </p>
      </main>
    );
  }

  const isAdmin = await getIsAdmin(clerkId);
  if (!isAdmin) {
    return (
      <main className="page-shell py-2 sm:py-4">
        <p className="panel-card rounded-[1.35rem] p-4 text-sm text-foreground/70">
          This page is only available to admins.
        </p>
        <Link
          href="/browse"
          className="surface-button inline-flex w-fit rounded-full border px-4 py-2 text-sm"
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
    <main className="page-shell-wide h-full overflow-hidden py-2 sm:py-0">
      <ResourceManagerWorkspace volumes={volumes} booksByVolume={booksByVolume} />
    </main>
  );
}
