import type { ReactNode } from "react";
import WordExplore from "@/features/comeFollowMe/WordExplore";

export default function ChapterGuidesLayout({ children }: { children: ReactNode }) {
  return <WordExplore>{children}</WordExplore>;
}
