import { redirect } from "next/navigation";
import BrowseSelector from "@/components/BrowseSelector";
import { browseVolumeHref } from "@/lib/browseRoutes";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

export default async function VolumePage({ params }: { params: Promise<{ volume: string }> }) {
  const { volume } = await params;
  const canonicalVolume = normalizeScriptureVolume(volume);
  if (canonicalVolume === "doctrineandcovenants") {
    // A one-book volume opens straight to its book.
    redirect(browseVolumeHref(canonicalVolume));
  }
  return <BrowseSelector />;
}
