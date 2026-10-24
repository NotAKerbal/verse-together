"use client";

// Connects the Notes page's view to the browser's history (journalHistory.ts): every change a person makes
// goes through the returned `go`, and Back, Forward and arriving on a note's entry come back through `show`
// and `select`. Shared by the /notes page and the component QA harness.

import { useCallback, useEffect, useRef, useState } from "react";
import { JournalHistory, type HistoryPort, type JournalHistoryHandlers } from "./journalHistory";
import type { JournalView } from "./journalView";

const browserHistory: HistoryPort = {
  get state() {
    return window.history.state as unknown;
  },
  pushState: (state) => window.history.pushState(state, ""),
  replaceState: (state) => window.history.replaceState(state, ""),
  back: () => window.history.back(),
};

type Options = JournalHistoryHandlers & {
  /**
   * Once true, history is followed: Back and Forward, and a note entry arrived on is reopened. Until then
   * (signing in, the notes list loading) nothing is selected, so no note is reopened before it can be.
   */
  enabled: boolean;
};

export function useJournalHistory(view: JournalView, { enabled, show, select }: Options) {
  const viewRef = useRef(view);
  const [history] = useState(() => new JournalHistory(browserHistory, { show: () => {}, select: () => {} }));
  useEffect(() => {
    viewRef.current = view;
    history.setHandlers({
      show: (next) => {
        viewRef.current = next;
        show(next);
      },
      select,
    });
  });
  const [live, setLive] = useState(false);
  if (enabled && !live) setLive(true);

  useEffect(() => {
    if (!live) return;
    const onPopState = () => history.popState();
    window.addEventListener("popstate", onPopState);
    // On the next frame, after this commit's other effects (a provider restoring its own active note).
    const frame = window.requestAnimationFrame(() => history.restore());
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.cancelAnimationFrame(frame);
      history.dispose();
    };
  }, [history, live]);

  /** Move to `next`, worked out from the view on screen when given a function. */
  return useCallback(
    (next: JournalView | ((view: JournalView) => JournalView)) => {
      const from = viewRef.current;
      history.go(from, typeof next === "function" ? next(from) : next);
    },
    [history]
  );
}
