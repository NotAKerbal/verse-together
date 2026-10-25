"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLightbulb } from "@fortawesome/free-solid-svg-icons";
import type { InsightVisibility } from "@/lib/appData";

// Retained for existing saved notes; the retired menus no longer own sharing controls.
const VISIBILITY_LABELS: Record<InsightVisibility, string> = {
  private: "Only me",
  friends: "Friends",
  link: "Anyone with the link",
  public: "Public",
};

export function visibilityLabel(visibility: InsightVisibility): string {
  return VISIBILITY_LABELS[visibility] ?? "Only me";
}

export function LightbulbBadge({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-9 w-9";
  const icon = size === "lg" ? "h-4.5 w-4.5" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-primary)] text-[#17161a] ${className}`}
    >
      <FontAwesomeIcon icon={faLightbulb} className={icon} />
    </span>
  );
}
