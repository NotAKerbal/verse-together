import type { ReactNode } from "react";
import WordExplore from "@/features/comeFollowMe/WordExplore";

export default function ComeFollowMeLayout({ children }: { children: ReactNode }) {
  return <WordExplore>{children}</WordExplore>;
}
