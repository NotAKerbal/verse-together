// Like the web (layout.tsx's first-paint script), the theme follows the system light/dark preference and keeps
// following it while the app is open. There is no stored choice.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "./tokens";

export type Theme = { scheme: "light" | "dark"; colors: ThemeColors };

const ThemeContext = createContext<Theme>({ scheme: "light", colors: lightColors });

export function ThemeProvider({ children, scheme: forced }: { children: ReactNode; scheme?: "light" | "dark" }) {
  const system = useColorScheme();
  const scheme = forced ?? (system === "dark" ? "dark" : "light");
  const value = useMemo<Theme>(() => ({ scheme, colors: scheme === "dark" ? darkColors : lightColors }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
