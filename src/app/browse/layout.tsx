import type { ReactNode } from "react";
import { ChapterNavigationProvider } from "@/components/ChapterNavigation";

// Chapter navigations inside the Library show the destination chapter's page at once (see ChapterNavigationProvider).
export default function BrowseLayout({ children }: { children: ReactNode }) {
  return <ChapterNavigationProvider>{children}</ChapterNavigationProvider>;
}
