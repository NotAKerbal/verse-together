"use client";

import { useEffect } from "react";

export default function Ripple() {
  useEffect(() => {
    function getRippleTarget(start: EventTarget | null): HTMLElement | null {
      const origin = start as HTMLElement | null;
      if (!origin) return null;
      const el = origin.closest(
        "button, a, [data-ripple], [role='button']"
      ) as HTMLElement | null;
      if (!el) return null;
      if (
        el instanceof HTMLButtonElement &&
        (el.disabled || el.getAttribute("aria-disabled") === "true")
      ) {
        return null;
      }
      return el;
    }

    function runRipple(targetElement: HTMLElement, clientX: number, clientY: number) {
      const rect = targetElement.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const maxX = Math.max(localX, rect.width - localX);
      const maxY = Math.max(localY, rect.height - localY);
      const radius = Math.sqrt(maxX * maxX + maxY * maxY);
      const size = radius * 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple rippling";
      ripple.style.setProperty("--ripple-x", `${localX}px`);
      ripple.style.setProperty("--ripple-y", `${localY}px`);
      ripple.style.setProperty("--ripple-size", `${size}px`);

      const computed = getComputedStyle(targetElement);
      const needsPositioning = computed.position === "static";
      const hadOverflowHidden = computed.overflow === "hidden";

      const previousPosition = targetElement.style.position;
      const previousOverflow = targetElement.style.overflow;

      if (needsPositioning) {
        targetElement.style.position = "relative";
      }
      if (!hadOverflowHidden) {
        targetElement.style.overflow = "hidden";
      }

      ripple.addEventListener("animationend", () => {
        ripple.remove();
        if (needsPositioning) {
          targetElement.style.position = previousPosition;
        }
        if (!hadOverflowHidden) {
          targetElement.style.overflow = previousOverflow;
        }
      });

      targetElement.appendChild(ripple);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return; // left click only
      const targetElement = getRippleTarget(event.target);
      if (!targetElement) return;
      runRipple(targetElement, event.clientX, event.clientY);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const targetElement = getRippleTarget(event.target);
      if (!targetElement) return;
      const key = event.key;
      if (key !== "Enter" && key !== " ") return;
      const rect = targetElement.getBoundingClientRect();
      // Center ripple for keyboard activation
      runRipple(targetElement, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}

