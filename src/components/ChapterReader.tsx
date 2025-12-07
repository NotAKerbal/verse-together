"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Breadcrumbs, { Crumb } from "./Breadcrumbs";
import VerseActionBar from "./VerseActionBar";
import CitationsModal from "./CitationsModal";
import VerseExplorer from "./VerseExplorer";
import { useAuth } from "@/lib/auth";
import FootnoteModal from "./FootnoteModal";
import type { Footnote } from "@/lib/openscripture";
import { fetchChapter } from "@/lib/openscripture";
import ReaderSettings from "./ReaderSettings";
import type { ReaderPreferences } from "@/lib/preferences";
import { getDefaultPreferences, loadPreferences, savePreferences, hasSeenTapToActionsHint, setSeenTapToActionsHint } from "@/lib/preferences";

type Verse = { verse: number; text: string; footnotes?: Footnote[] };
type ShareRow = { id: string; verse_start: number; verse_end: number };
type ReactionRow = { id: string; share_id: string };
type CommentDetail = { id: string; share_id: string; user_id: string; body: string; created_at: string; visibility: "public" | "friends" };

export default function ChapterReader({
  volume,
  book,
  chapter,
  verses,
  reference,
  breadcrumbs,
  prevHref,
  nextHref,
}: {
  volume: string;
  book: string;
  chapter: number;
  verses: Verse[];
  reference: string;
  breadcrumbs: Crumb[];
  prevHref?: string;
  nextHref?: string;
}) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ReaderPreferences>(getDefaultPreferences());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentVisibility, setCommentVisibility] = useState<"public" | "friends">("public");
  const [verseIndicators, setVerseIndicators] = useState<Record<number, { comments: number; likes: number }>>({});
  const [verseComments, setVerseComments] = useState<Record<number, Array<{ id: string; user_id: string; body: string; created_at: string }>>>({});
  const [commenterNames, setCommenterNames] = useState<Record<string, string>>({});
  const [openFootnote, setOpenFootnote] = useState<null | { footnote: string; verseText: string; highlightText?: string }>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animTargetX, setAnimTargetX] = useState<number | null>(null);
  const navHrefRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const [prevPreview, setPrevPreview] = useState<null | { reference: string; preview: string }>(null);
  const [nextPreview, setNextPreview] = useState<null | { reference: string; preview: string }>(null);
  const [openCitations, setOpenCitations] = useState(false);
  const [openExplorer, setOpenExplorer] = useState(false);
  const overlayOpen = isCommentOpen || !!openFootnote || openCitations || openExplorer;
  const [showTapHint, setShowTapHint] = useState(false);

  function parseBrowseHref(href: string | undefined): { volume: string; book: string; chapter: number } | null {
    if (!href) return null;
    const clean = href.split("?")[0].split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    // expect: ["browse", volume, book, chapter]
    if (parts.length >= 4 && parts[0] === "browse") {
      const vol = decodeURIComponent(parts[1] || "");
      const b = decodeURIComponent(parts[2] || "");
      const chStr = decodeURIComponent(parts[3] || "");
      const ch = Number(chStr);
      if (vol && b && Number.isFinite(ch)) return { volume: vol, book: b, chapter: ch };
    }
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    async function prefetch() {
      const nextInfo = parseBrowseHref(nextHref);
      const prevInfo = parseBrowseHref(prevHref);
      try {
        if (nextInfo) {
          const chap = await fetchChapter(nextInfo.volume, nextInfo.book, nextInfo.chapter);
          if (!cancelled) {
            const text = chap.verses.slice(0, 3).map(v => `${v.verse}. ${v.text}`).join("\n");
            setNextPreview({ reference: chap.reference, preview: text });
          }
        } else {
          setNextPreview(null);
        }
      } catch {
        if (!cancelled) setNextPreview(null);
      }
      try {
        if (prevInfo) {
          const chap = await fetchChapter(prevInfo.volume, prevInfo.book, prevInfo.chapter);
          if (!cancelled) {
            const text = chap.verses.slice(0, 3).map(v => `${v.verse}. ${v.text}`).join("\n");
            setPrevPreview({ reference: chap.reference, preview: text });
          }
        } else {
          setPrevPreview(null);
        }
      } catch {
        if (!cancelled) setPrevPreview(null);
      }
    }
    prefetch();
    return () => {
      cancelled = true;
    };
  }, [nextHref, prevHref]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadPreferences(user?.id ?? null);
      if (!alive) return;
      setPrefs(loaded);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    // Show one-time hint on first use
    try {
      if (!hasSeenTapToActionsHint()) {
        setShowTapHint(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function toggleVerse(n: number) {
    if (showTapHint) {
      try { setSeenTapToActionsHint(); } catch {}
      setShowTapHint(false);
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  // range selection removed from UI for simplicity

  const selectedText = useMemo(() => {
    const picked = verses.filter((v) => selected.has(v.verse));
    return picked.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [verses, selected]);

  const selectedFirstWord = useMemo(() => {
    // Prefer DOM text selection when available
    if (typeof window !== "undefined") {
      const sel = window.getSelection?.();
      const raw = sel ? String(sel.toString()) : "";
      const trimmed = raw.trim();
      if (trimmed) {
        const mSel = trimmed.match(/[A-Za-z][A-Za-z'\-]*/);
        if (mSel?.[0]) return mSel[0].toLowerCase();
      }
    }
    const picked = verses.filter((v) => selected.has(v.verse));
    const text = picked.map((v) => v.text).join(" ");
    const m = text.match(/[A-Za-z][A-Za-z'\-]*/);
    return m?.[0]?.toLowerCase() ?? "";
  }, [verses, selected]);

  // first/last verse values not currently used

  function renderVerseText(v: Verse) {
    if (!prefs.showFootnotes) return v.text;
    const fns = v.footnotes ?? [];
    if (!fns || fns.length === 0) return v.text;
    const parts: Array<ReactNode> = [];
    const sorted = fns
      .slice()
      .filter((f) => typeof f.start === "number" && typeof f.end === "number")
      .sort((a, b) => (a.start! - b.start!));
    let cursor = 0;
    sorted.forEach((fn, idx) => {
      const start = Math.max(0, Math.min(v.text.length, fn.start ?? 0));
      const originalEnd = Math.max(start, Math.min(v.text.length - 1, (fn.end ?? start)));
      if (start > cursor) {
        parts.push(v.text.slice(cursor, start));
      }
      let displayEnd = originalEnd;
      let trailing = "";
      while (displayEnd >= start && /\s/.test(v.text.charAt(displayEnd))) {
        trailing = v.text.charAt(displayEnd) + trailing;
        displayEnd -= 1;
      }
      if (displayEnd >= start) {
        const highlighted = v.text.slice(start, displayEnd + 1);
        parts.push(
          <span
            key={`fn-${v.verse}-${idx}-${start}-${displayEnd}`}
            className="bg-sky-200/50 dark:bg-sky-400/25 rounded px-0.5 cursor-pointer ring-1 ring-sky-600/20"
            onClick={(e) => {
              e.stopPropagation();
              setOpenFootnote({ footnote: fn.footnote, verseText: v.text, highlightText: highlighted });
            }}
            role="button"
            aria-label="Show footnote"
          >
            {highlighted}
          </span>
        );
      }
      if (trailing) {
        parts.push(trailing);
      }
      cursor = originalEnd + 1;
    });
    if (cursor < v.text.length) {
      parts.push(v.text.slice(cursor));
    }
    return <>{parts}</>;
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    touchStartTime.current = Date.now();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    const horizontalEnough = Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (!horizontalEnough) return;
    setIsDragging(true);
    const hasPrev = !!prevHref;
    const hasNext = !!nextHref;
    const direction = dx < 0 ? -1 : 1;
    const allowed = (direction < 0 && hasNext) || (direction > 0 && hasPrev);
    const maxDrag = typeof window !== "undefined" ? Math.max(120, Math.floor(window.innerWidth * 0.92)) : 120;
    const clamp = allowed ? maxDrag : 24;
    const clamped = Math.max(-clamp, Math.min(clamp, dx));
    setDragDx(clamped);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null || touchStartTime.current == null) return;
    const t = e.changedTouches[0];
    const dx = (t.clientX - touchStartX.current);
    const dy = (t.clientY - touchStartY.current);
    const dt = Date.now() - touchStartTime.current;
    // Basic horizontal swipe detection
    const distanceThreshold = 48; // px
    const velocityOk = dt < 800;
    const horizontalEnough = Math.abs(dx) > distanceThreshold && Math.abs(dx) > Math.abs(dy) * 1.3;
    let targetHref: string | null = null;
    let slideX = 0;
    if (horizontalEnough && velocityOk) {
      if (dx < 0 && nextHref) {
        targetHref = nextHref;
        slideX = -window.innerWidth;
      } else if (dx > 0 && prevHref) {
        targetHref = prevHref;
        slideX = window.innerWidth;
      }
    }
    if (targetHref) {
      navHrefRef.current = targetHref;
      leavingRef.current = true;
      setAnimTargetX(slideX);
    } else {
      setAnimTargetX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchStartTime.current = null;
  }

  function onTransitionEnd() {
    if (leavingRef.current && navHrefRef.current) {
      const href = navHrefRef.current;
      navHrefRef.current = null;
      leavingRef.current = false;
      router.push(href);
      return;
    }
    setAnimTargetX(null);
    setIsDragging(false);
    setDragDx(0);
  }

  useEffect(() => {
    let alive = true;
    async function loadIndicators() {
      setVerseIndicators({});
      const { data: shares, error } = await supabase
        .from("scripture_shares")
        .select("id, verse_start, verse_end")
        .eq("volume", volume)
        .eq("book", book)
        .eq("chapter", chapter);
      if (error || !shares || shares.length === 0) return;
      const shareIds = (shares as ShareRow[]).map((s) => s.id);
      const [{ data: comments }, { data: reactions }] = await Promise.all([
        supabase.from("scripture_comments").select("id, share_id, user_id, body, created_at, visibility").in("share_id", shareIds),
        supabase.from("scripture_reactions").select("id, share_id").in("share_id", shareIds),
      ]);
      const commentsByShare: Record<string, number> = {};
      const reactionsByShare: Record<string, number> = {};
      (comments as CommentDetail[] | null ?? []).forEach((c) => {
        commentsByShare[c.share_id] = (commentsByShare[c.share_id] ?? 0) + 1;
      });
      (reactions as ReactionRow[] | null ?? []).forEach((r) => {
        reactionsByShare[r.share_id] = (reactionsByShare[r.share_id] ?? 0) + 1;
      });
      const map: Record<number, { comments: number; likes: number }> = {};
      for (const s of shares as ShareRow[]) {
        const likeCount = reactionsByShare[s.id] ?? 0;
        const commentCount = commentsByShare[s.id] ?? 0;
        if (likeCount === 0 && commentCount === 0) continue;
        for (let v = s.verse_start; v <= s.verse_end; v++) {
          map[v] = {
            comments: (map[v]?.comments ?? 0) + commentCount,
            likes: (map[v]?.likes ?? 0) + likeCount,
          };
        }
      }
      if (!alive) return;
      setVerseIndicators(map);

      // Build top comments per verse (up to 3, newest first)
      const commentsByVerse: Record<number, Array<{ id: string; user_id: string; body: string; created_at: string }>> = {};
      const commentsByShareFull: Record<string, CommentDetail[]> = {};
      (comments as CommentDetail[] | null ?? []).forEach((c) => {
        (commentsByShareFull[c.share_id] ||= []).push(c);
      });
      for (const s of shares as ShareRow[]) {
        const list = (commentsByShareFull[s.id] ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        if (list.length === 0) continue;
        for (let v = s.verse_start; v <= s.verse_end; v++) {
          const agg = (commentsByVerse[v] ||= []);
          for (const c of list) {
            if (agg.length < 6) {
              // temporarily allow more, will trim to 3 after merge across shares
              agg.push({ id: c.id, user_id: c.user_id, body: c.body, created_at: c.created_at });
            }
          }
        }
      }
      // Deduplicate by id per verse, sort, and cap to 3
      Object.keys(commentsByVerse).forEach((k) => {
        const v = Number(k);
        const seen: Record<string, boolean> = {};
        const dedup = commentsByVerse[v].filter((c) => {
          if (seen[c.id]) return false;
          seen[c.id] = true;
          return true;
        });
        dedup.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        commentsByVerse[v] = dedup.slice(0, 3);
      });
      if (!alive) return;
      setVerseComments(commentsByVerse);

      // Load commenter display names
      const uniqueUserIds = Array.from(
        new Set((comments as CommentDetail[] | null ?? []).map((c) => c.user_id))
      );
      if (uniqueUserIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", uniqueUserIds);
        const nameMap: Record<string, string> = {};
        (profs as Array<{ user_id: string; display_name: string }> | null)?.forEach((p) => {
          nameMap[p.user_id] = p.display_name;
        });
        if (!alive) return;
        setCommenterNames(nameMap);
      } else {
        setCommenterNames({});
      }
    }
    loadIndicators();
    return () => {
      alive = false;
    };
  }, [volume, book, chapter]);

  const translateX = animTargetX !== null ? animTargetX : isDragging ? dragDx : 0;
  const progress = Math.min(1, Math.max(0, Math.abs(translateX) / (typeof window !== "undefined" ? Math.max(120, Math.floor(window.innerWidth * 0.92)) : 120)));
  const overlayOpacity = progress * 0.9; // fade-in intensity
  const transition = animTargetX !== null ? "transform 240ms ease-out" : isDragging ? "none" : undefined;

  return (
    <section className="space-y-4 pb-20" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Preview overlay behind the sliding content */}
      {isDragging || animTargetX !== null ? (
        <div className="pointer-events-none fixed inset-0 z-0">
          {/* Right swipe shows previous title */}
          {translateX > 0 && prevPreview ? (
            <div className="absolute inset-0 flex items-start justify-start">
              <div className="m-3 sm:m-4 rounded-md border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-3 py-2 shadow"
                   style={{ opacity: overlayOpacity }}>
                <div className="text-base sm:text-xl font-semibold">{prevPreview.reference}</div>
              </div>
            </div>
          ) : null}
          {/* Left swipe shows next title */}
          {translateX < 0 && nextPreview ? (
            <div className="absolute inset-0 flex items-start justify-end">
              <div className="m-3 sm:m-4 rounded-md border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-3 py-2 shadow text-right"
                   style={{ opacity: overlayOpacity }}>
                <div className="text-base sm:text-xl font-semibold">{nextPreview.reference}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        onTransitionEnd={onTransitionEnd}
        style={{ transform: `translateX(${translateX}px)`, transition, willChange: "transform" }}
        className="relative"
      >
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-black/5 dark:border-white/10 py-2">
          <div className="relative flex flex-col gap-1">
            <div className="text-xs sm:text-sm pr-10">
              <Breadcrumbs items={breadcrumbs} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-base sm:text-xl font-semibold">{reference}</h1>
              <button
                aria-label="Reader settings"
                title="Reader settings"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              >
                ⚙
              </button>
            </div>
          </div>
        </header>

        <ol
          className={`space-y-2 sm:space-y-3 ${prefs.fontFamily === "sans" ? "font-sans" : "font-serif"}`}
          style={{ fontSize: `${prefs.fontScale}rem` }}
        >
        {(() => {
          const blocks: Array<{ key: string; verses: Verse[]; type: "selected" | "active" | "plain" }> = [];
          let i = 0;
          while (i < verses.length) {
            const v = verses[i];
            const isSel = selected.has(v.verse);
            if (isSel) {
              const start = i;
              let end = i;
              while (end + 1 < verses.length && selected.has(verses[end + 1].verse)) end += 1;
              const group = verses.slice(start, end + 1);
              blocks.push({ key: `sel-${group[0].verse}-${group[group.length - 1].verse}`, verses: group, type: "selected" });
              i = end + 1;
              continue;
            }
            const ind0 = verseIndicators[v.verse];
            const hasActivity0 = !!ind0 && (ind0.likes > 0 || ind0.comments > 0);
            if (hasActivity0) {
              const start = i;
              let end = i;
              while (end + 1 < verses.length) {
                const nextV = verses[end + 1];
                if (selected.has(nextV.verse)) break;
                const nextInd = verseIndicators[nextV.verse];
                const nextActive = !!nextInd && (nextInd.likes > 0 || nextInd.comments > 0);
                if (!nextActive) break;
                end += 1;
              }
              const group = verses.slice(start, end + 1);
              blocks.push({ key: `act-${group[0].verse}-${group[group.length - 1].verse}`, verses: group, type: "active" });
              i = end + 1;
              continue;
            }
            blocks.push({ key: `p-${v.verse}`, verses: [v], type: "plain" });
            i += 1;
          }
          return blocks.map((b) => {
            if (b.type === "selected") {
              return (
                <li key={b.key} className="leading-7 rounded-md px-3 py-2 -mx-2 my-2 bg-amber-200/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30">
                  <div className="space-y-1">
                    {b.verses.map((v, idx) => (
                      <div key={v.verse}>
                        <button onClick={() => toggleVerse(v.verse)} className="text-left w-full">
                          <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                          <span>{renderVerseText(v)}</span>
                        </button>
                        {(() => {
                          const ind = verseIndicators[v.verse];
                          const isLast = idx === b.verses.length - 1;
                          return ind && (ind.likes > 0 || ind.comments > 0) ? (
                            <div className="mt-1 text-xs text-foreground/60 flex items-center gap-3">
                              {isLast && ind.likes > 0 ? <span>❤ {ind.likes}</span> : null}
                              {ind.comments > 0 ? <span>💬 {ind.comments}</span> : null}
                            </div>
                          ) : null;
                        })()}
                        {verseComments[v.verse] && verseComments[v.verse].length > 0 ? (
                          <ul className="mt-2 space-y-1 text-[0.95em] text-foreground/70">
                            {verseComments[v.verse].map((c) => (
                              <li key={c.id} className="border border-black/5 dark:border-white/10 rounded-md p-2 bg-black/5 dark:bg-white/5">
                                <span className="font-medium text-foreground/75 mr-2">{commenterNames[c.user_id] ?? `User ${c.user_id.slice(0, 6)}`}</span>
                                <span className="text-foreground/70">{c.body}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </li>
              );
            }
            if (b.type === "active") {
              return (
                <li key={b.key} className="leading-7 rounded-md px-3 py-2 -mx-2 my-2 ring-1 ring-black/10 dark:ring-white/15">
                  <div className="space-y-1">
                    {b.verses.map((v, idx) => {
                      const ind = verseIndicators[v.verse];
                      const isLast = idx === b.verses.length - 1;
                      return (
                        <div key={v.verse}>
                          <button onClick={() => toggleVerse(v.verse)} className="text-left w-full">
                            <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                            <span>{renderVerseText(v)}</span>
                          </button>
                          {ind && (ind.likes > 0 || ind.comments > 0) ? (
                            <div className="mt-1 text-xs text-foreground/60 flex items-center gap-3">
                              {isLast && ind.likes > 0 ? <span>❤ {ind.likes}</span> : null}
                              {ind.comments > 0 ? <span>💬 {ind.comments}</span> : null}
                            </div>
                          ) : null}
                          {verseComments[v.verse] && verseComments[v.verse].length > 0 ? (
                            <ul className="mt-2 space-y-1 text-[0.95em] text-foreground/70">
                              {verseComments[v.verse].map((c) => (
                                <li key={c.id} className="border border-black/5 dark:border-white/10 rounded-md p-2 bg-black/5 dark:bg-white/5">
                                  <span className="font-medium text-foreground/75 mr-2">{commenterNames[c.user_id] ?? `User ${c.user_id.slice(0, 6)}`}</span>
                                  <span className="text-foreground/70">{c.body}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            }
            // plain
            const v = b.verses[0];
            const ind = verseIndicators[v.verse];
            return (
              <li key={b.key} className="leading-7 rounded-md px-3 py-2 -mx-2 my-2">
                <button onClick={() => toggleVerse(v.verse)} className="text-left w-full">
                  <div>
                    <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                    <span>{renderVerseText(v)}</span>
                  </div>
                </button>
                {ind && (ind.likes > 0 || ind.comments > 0) ? (
                  <div className="mt-1 text-xs text-foreground/60 flex items-center gap-3">
                    {ind.likes > 0 ? <span>❤ {ind.likes}</span> : null}
                    {ind.comments > 0 ? <span>💬 {ind.comments}</span> : null}
                  </div>
                ) : null}
                {verseComments[v.verse] && verseComments[v.verse].length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[0.95em] text-foreground/70">
                    {verseComments[v.verse].map((c) => (
                      <li key={c.id} className="border border-black/5 dark:border-white/10 rounded-md p-2 bg-black/5 dark:bg-white/5">
                        <span className="font-medium text-foreground/75 mr-2">{commenterNames[c.user_id] ?? `User ${c.user_id.slice(0, 6)}`}</span>
                        <span className="text-foreground/70">{c.body}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          });
        })()}
        </ol>

      </div>

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onChange={(next) => {
          setPrefs(next);
          void savePreferences(user?.id ?? null, next);
        }}
      />

      {/* One-time onboarding tooltip */}
      {showTapHint && !overlayOpen && selected.size === 0 ? (
        <div
          className="fixed inset-x-0 z-40 pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <div className="mx-auto max-w-3xl px-3 sm:px-4 pointer-events-auto">
            <div
              className="mx-auto w-full sm:w-auto sm:inline-block rounded-md border border-black/10 dark:border-white/15 bg-background/90 backdrop-blur px-3 py-2 shadow"
              style={{ maxWidth: "28rem" }}
              role="dialog"
              aria-live="polite"
            >
              <div className="text-sm flex items-start gap-3">
                <div className="text-lg select-none" aria-hidden>👉</div>
                <div className="flex-1">
                  Tap a scripture to view available actions.
                </div>
                <button
                  onClick={() => {
                    try { setSeenTapToActionsHint(); } catch {}
                    setShowTapHint(false);
                  }}
                  className="ml-2 text-sm px-2 py-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCommentOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close"
            onClick={() => {
              if (!submittingComment) {
                setIsCommentOpen(false);
                setCommentText("");
                setCommentError(null);
              }
            }}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-4 space-y-3">
            <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
            <h3 className="text-base font-semibold">Add a comment</h3>
            {selectedText ? (
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-sm text-foreground/80 border border-black/10 dark:border-white/15 rounded-md p-2 bg-black/5 dark:bg-white/5">{selectedText}</pre>
            ) : null}
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-foreground/70">Your comment</span>
              <textarea
                rows={4}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
                placeholder="Write your thoughts…"
                disabled={submittingComment}
              />
            </label>
            {commentError ? <p className="text-sm text-red-600">{commentError}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-foreground/70">Visibility</label>
                <select
                  value={commentVisibility}
                  onChange={(e) => setCommentVisibility(e.target.value as "public" | "friends")}
                  className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1"
                >
                  <option value="public">Public</option>
                  <option value="friends">Friends</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  if (!submittingComment) {
                    setIsCommentOpen(false);
                    setCommentText("");
                    setCommentError(null);
                  }
                }}
                className="px-4 py-2 text-sm rounded-md border border-black/10 dark:border-white/15"
                disabled={submittingComment}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!commentText.trim()) {
                    setCommentError("Please enter a comment.");
                    return;
                  }
                  const { data: session } = await supabase.auth.getSession();
                  if (!session.session) {
                    setCommentError("Please sign in to comment.");
                    return;
                  }
                  setSubmittingComment(true);
                  setCommentError(null);
                  const s = Math.min(...Array.from(selected));
                  const e = Math.max(...Array.from(selected));
                  const { data, error } = await supabase
                    .from("scripture_shares")
                    .insert({
                      volume,
                      book,
                      chapter,
                      verse_start: s,
                      verse_end: e,
                      translation: null,
                      note: null,
                      content: selectedText || null,
                    })
                    .select("id")
                    .single();
                  if (error || !data) {
                    setCommentError(error?.message ?? "Failed creating share");
                    setSubmittingComment(false);
                    return;
                  }
                  const shareId = (data as { id: string }).id;
                  const { error: e2 } = await supabase
                    .from("scripture_comments")
                    .insert({ share_id: shareId, body: commentText.trim(), visibility: commentVisibility });
                  if (e2) {
                    setCommentError(e2.message);
                    setSubmittingComment(false);
                    return;
                  }
                  setSubmittingComment(false);
                  setIsCommentOpen(false);
                  setCommentText("");
                  setCommentVisibility("public");
                  setSelected(new Set());
                }}
                className="px-5 py-2 text-sm rounded-md bg-foreground text-background font-medium hover:opacity-90 disabled:opacity-60"
                disabled={submittingComment}
              >
                {submittingComment ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openFootnote ? (
        <FootnoteModal
          open={true}
          onClose={() => setOpenFootnote(null)}
          footnote={openFootnote.footnote}
          verseText={openFootnote.verseText}
          highlightText={openFootnote.highlightText}
        />
      ) : null}

      {openCitations ? (
        <CitationsModal
          open={true}
          onClose={() => setOpenCitations(false)}
          volume={volume}
          book={book}
          chapter={chapter}
          verseStart={Math.min(...Array.from(selected))}
          verseEnd={Math.max(...Array.from(selected))}
        />
      ) : null}

      {openExplorer ? (
        <VerseExplorer
          open={true}
          onClose={() => setOpenExplorer(false)}
          verses={verses.filter((v) => selected.has(v.verse)).map((v) => ({ verse: v.verse, text: v.text }))}
        />
      ) : null}

      {/* dictionary and etymology now live inside VerseExplorer */}

      <VerseActionBar
        visible={selected.size > 0 && !overlayOpen}
        actionsEnabled={!!user}
        onClear={() => setSelected(new Set())}
        onLike={async () => {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          alert("Please sign in to like.");
          return;
        }
        const s = Math.min(...Array.from(selected));
        const e = Math.max(...Array.from(selected));
        const { data, error } = await supabase
          .from("scripture_shares")
          .insert({
            volume,
            book,
            chapter,
            verse_start: s,
            verse_end: e,
            translation: null,
            note: null,
            content: selectedText || null,
          })
          .select("id")
          .single();
        if (error || !data) {
          // surface error minimally
          return;
        }
        const shareId = (data as { id: string }).id;
        const { error: reactError } = await supabase.rpc("toggle_reaction", {
          p_share_id: shareId,
          p_reaction: "like",
        });
        if (reactError) {
          return;
        }
        setSelected(new Set());
        }}
        onComment={async () => {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;
        setCommentError(null);
        setIsCommentOpen(true);
        }}
        onCitations={() => {
          setOpenCitations(true);
        }}
        onExplore={() => {
          if (selected.size === 0) return;
          setOpenExplorer(true);
        }}
      />
    </section>
  );
}
