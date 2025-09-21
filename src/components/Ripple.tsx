"use client";

import { useEffect } from "react";

export default function Ripple() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const origin = event.target as HTMLElement | null;
      if (!origin) return;

      const targetElement = origin.closest("button, [data-ripple]") as
        | HTMLElement
        | null;
      if (!targetElement) return;

      if (
        targetElement instanceof HTMLButtonElement &&
        (targetElement.disabled || targetElement.getAttribute("aria-disabled") === "true")
      ) {
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const maxX = Math.max(clickX, rect.width - clickX);
      const maxY = Math.max(clickY, rect.height - clickY);
      const radius = Math.sqrt(maxX * maxX + maxY * maxY);
      const size = radius * 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple rippling";
      ripple.style.setProperty("--ripple-x", `${clickX}px`);
      ripple.style.setProperty("--ripple-y", `${clickY}px`);
      ripple.style.setProperty("--ripple-size", `${size}px`);

      const computed = getComputedStyle(targetElement);
      const needsPositioning = computed.position === "static";
      const hadOverflowHidden = computed.overflow === "hidden";

      const previousPosition = (targetElement as HTMLElement).style.position;
      const previousOverflow = (targetElement as HTMLElement).style.overflow;

      if (needsPositioning) {
        (targetElement as HTMLElement).style.position = "relative";
      }
      if (!hadOverflowHidden) {
        (targetElement as HTMLElement).style.overflow = "hidden";
      }

      ripple.addEventListener("animationend", () => {
        ripple.remove();
        if (needsPositioning) {
          (targetElement as HTMLElement).style.position = previousPosition;
        }
        if (!hadOverflowHidden) {
          (targetElement as HTMLElement).style.overflow = previousOverflow;
        }
      });

      targetElement.appendChild(ripple);
    }

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return null;
}

