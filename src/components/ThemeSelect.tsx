"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { AppTheme, THEME_STORAGE_KEY, applyTheme, isAppTheme, resolveTheme, saveTheme } from "@/lib/theme";

const THEME_CHANGE_EVENT = "vt-theme-change";

type Props = {
  compact?: boolean;
};

const options = [
  { value: "light" as const, label: "Light", icon: faSun },
  { value: "sepia" as const, label: "Sepia", icon: faBookOpen },
  { value: "dark" as const, label: "Dark", icon: faMoon },
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
              className="segmented-control-button h-9 w-9 p-0"
            >
              <FontAwesomeIcon icon={opt.icon} className="h-[18px] w-[18px]" />
              <span className="sr-only">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
