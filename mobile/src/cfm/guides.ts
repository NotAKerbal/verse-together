// Published Come, Follow Me guides: the card metadata from content/cfm/guides.json (through the web's own index
// module) and each guide's full native form, generated from the same Markdown.

import { PUBLISHED_GUIDES } from "@/features/comeFollowMe/guideIndex";
import type { NativeGuide } from "./guideTypes";

export { PUBLISHED_GUIDES };

let guides: NativeGuide[] | null = null;

export function nativeGuides(): NativeGuide[] {
  guides ??= require("../generated/cfmGuides.json") as NativeGuide[];
  return guides;
}

export function getNativeGuide(weekStart: string): NativeGuide | null {
  return nativeGuides().find((guide) => guide.startDate === weekStart) ?? null;
}
