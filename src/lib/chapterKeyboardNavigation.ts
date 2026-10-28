type ArrowKeyEvent = Pick<KeyboardEvent, "key" | "defaultPrevented" | "repeat" | "isComposing" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/** Only unmodified, deliberate arrow presses on an idle desktop reader change chapters. */
export function chapterArrowHref(
  event: ArrowKeyEvent,
  { prevHref, nextHref, desktop, blocked }: { prevHref?: string; nextHref?: string; desktop: boolean; blocked: boolean }
): string | undefined {
  if (!desktop || blocked || event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === "ArrowLeft") return prevHref;
  if (event.key === "ArrowRight") return nextHref;
}
