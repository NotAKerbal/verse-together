import { createContext, useContext, type PropsWithChildren } from "react";
import { getFunctionName } from "convex/server";
import type { MarkColor } from "../../convex/annotationRules";

type Save = {
  body: string;
  highlightColor?: MarkColor;
  underline?: boolean;
  underlineColor?: MarkColor;
};
type Mutations = { save: (args: Save) => Promise<void>; remove: () => Promise<void> };
const Context = createContext<Mutations | null>(null);

export function FixtureMutations({ children, ...mutations }: PropsWithChildren<Mutations>) {
  return <Context.Provider value={mutations}>{children}</Context.Provider>;
}

// Only this isolated Vite harness aliases convex/react. No requests leave the browser.
export function useMutation(reference: Parameters<typeof getFunctionName>[0]) {
  const mutations = useContext(Context);
  if (!mutations) throw new Error("Missing annotation fixture mutations");
  return getFunctionName(reference).endsWith("upsertVerseAnnotation") ? mutations.save : mutations.remove;
}
