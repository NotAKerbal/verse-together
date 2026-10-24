"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type AppHeaderSlotValue = {
  target: HTMLElement | null;
  setTarget: (element: HTMLElement | null) => void;
  filled: boolean;
  register: () => () => void;
};

const AppHeaderSlotContext = createContext<AppHeaderSlotValue | null>(null);

/** Lets a page put its own controls at the right of the floating app header (Navbar). */
export function AppHeaderSlotProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [portals, setPortals] = useState(0);
  const register = useCallback(() => {
    setPortals((count) => count + 1);
    return () => setPortals((count) => count - 1);
  }, []);
  const value = useMemo(() => ({ target, setTarget, filled: portals > 0, register }), [target, portals, register]);
  return <AppHeaderSlotContext.Provider value={value}>{children}</AppHeaderSlotContext.Provider>;
}

/**
 * Where page controls appear in the header. Navbar renders it on every page, so it is already in place
 * when a page navigates in place (and the controls' focus target exists in the same commit).
 */
export function AppHeaderSlot({ className }: { className?: string }) {
  const slot = useContext(AppHeaderSlotContext);
  return <div ref={slot?.setTarget} className={className} />;
}

/**
 * `available`: the slot is mounted, so a page can show its header controls there (it is never true on the
 * server or before hydration, when only the page's own copy renders). `filled`: some page is using it.
 */
export function useAppHeaderSlot(): { available: boolean; filled: boolean } {
  const slot = useContext(AppHeaderSlotContext);
  return { available: slot?.target != null, filled: slot?.filled ?? false };
}

/** Renders its children in the header slot, keeping the caller's React context (e.g. BrowseLink's). */
export function AppHeaderPortal({ children }: { children: ReactNode }) {
  const slot = useContext(AppHeaderSlotContext);
  const target = slot?.target ?? null;
  const register = slot?.register;
  useLayoutEffect(() => (target && register ? register() : undefined), [target, register]);
  return target ? createPortal(children, target) : null;
}
