"use client";

import { useEffect, useState } from "react";
import { AppTheme, THEME_STORAGE_KEY, applyTheme, isAppTheme, resolveTheme, saveTheme } from "@/lib/theme";

const THEME_CHANGE_EVENT = "vt-theme-change";

type Props = {
  compact?: boolean;
};

const options: Array<{ value: AppTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
];

export default function ThemeSelect({ compact = false }: Props) {
  const [theme, setTheme] = useState<AppTheme>("light");

  useEffect(() => {
    const next = resolveTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    function syncFromDom() {
      const current = document.documentElement.getAttribute("data-theme");
      if (isAppTheme(current)) setTheme(current);
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = resolveTheme();
      setTheme(next);
      applyTheme(next);
    }
    window.addEventListener(THEME_CHANGE_EVENT, syncFromDom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromDom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <div className={compact ? "" : "text-foreground/85"}>
      <div className="segmented-control" role="group" aria-label="Theme">
        {options.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={`Use ${opt.label} theme`}
              aria-pressed={active}
              data-active={active ? "true" : "false"}
              onClick={() => {
                setTheme(opt.value);
                applyTheme(opt.value);
                saveTheme(opt.value);
                window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
              }}
              className="segmented-control-button w-auto px-3 text-xs font-medium"
            >
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
