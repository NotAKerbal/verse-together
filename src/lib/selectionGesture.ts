const NON_TEXT_CONTROLS =
  "button, input, select, textarea, [contenteditable], dialog, [role='dialog'], [data-selection-popover='true']";

const SELECTION_EXTENDING_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export const NATIVE_HANDLE_SETTLE_MS = 300;

function isTextTarget(target: EventTarget | null) {
  return !(target as Partial<Element> | null)?.closest?.(NON_TEXT_CONTROLS);
}

export function watchSelectionGesture(onChange: (active: boolean) => void) {
  let pressedPointerId: number | null = null;
  let extendingWithKeyboard = false;
  let settleTimer = 0;
  let touchPressedText = false;
  let selectedText = "";
  let active = false;

  const publish = () => {
    const next = pressedPointerId !== null || extendingWithKeyboard || settleTimer !== 0;
    if (next === active) return;
    active = next;
    onChange(next);
  };
  const stopSettling = () => {
    window.clearTimeout(settleTimer);
    settleTimer = 0;
  };
  const releasePointer = () => {
    pressedPointerId = null;
    publish();
  };
  const onPointerDown = (event: PointerEvent) => {
    const onText = isTextTarget(event.target);
    touchPressedText = onText && event.pointerType !== "mouse";
    if (!onText || event.button !== 0) return;
    stopSettling();
    pressedPointerId = event.pointerId;
    publish();
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId === pressedPointerId) releasePointer();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === pressedPointerId && event.buttons === 0) releasePointer();
  };
  const onBlur = () => {
    extendingWithKeyboard = false;
    releasePointer();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.shiftKey || !SELECTION_EXTENDING_KEYS.has(event.key) || !isTextTarget(event.target)) return;
    extendingWithKeyboard = true;
    publish();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.shiftKey) return;
    extendingWithKeyboard = false;
    publish();
  };
  const onSelectionChange = () => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString();
    if (text === selectedText) return;
    selectedText = text;
    if (!touchPressedText || pressedPointerId !== null) return;
    stopSettling();
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      publish();
    }, NATIVE_HANDLE_SETTLE_MS);
    publish();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("contextmenu", releasePointer);
  window.addEventListener("blur", onBlur);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    stopSettling();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("contextmenu", releasePointer);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
