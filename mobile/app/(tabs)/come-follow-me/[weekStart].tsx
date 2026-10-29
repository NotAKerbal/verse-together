import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openExternal, type AnchorElement } from "../../../src/components/Blocks";
import Sheet from "../../../src/components/Sheet";
import { Button, Icon, IconButton, Notice, PillBar, useBottomClearance } from "../../../src/components/ui";
import type { GuideContextBlock, GuideSection, NativeGuide, PassageRef, RangeEntry } from "../../../src/cfm/guideTypes";
import { getNativeGuide } from "../../../src/cfm/guides";
import { getChapter, type Verse } from "../../../src/data/scripture";
import GuideActions from "../../../src/features/cfm/GuideActions";
import { useGuideAnnotations } from "../../../src/features/cfm/guideAnnotationStore";
import GuideProse, { GuideProseProvider, useGuideProse } from "../../../src/features/cfm/GuideProse";
import { rootKey } from "../../../src/features/cfm/guideProse";
import { CoverCredit, LessonChapters, LessonCoverImage, PaintingCaption } from "../../../src/features/cfm/LessonParts";
import { useLessonVerseAnnotations } from "../../../src/features/cfm/lessonVerseAnnotations";
import { setDraftIntent } from "../../../src/features/journal/draftIntent";
import { buildScriptureDocument, documentMarks, type DocumentDecoration, type ScriptureStyle } from "../../../src/features/reader/scriptureDocument";
import ScriptureText, { type ScriptureTextHandle } from "../../../src/features/reader/ScriptureText";
import VerseActions from "../../../src/features/reader/VerseActions";
import { chapterPath } from "../../../src/navigation/hrefs";
import {
  formatWeekRange,
  getAdjacentWeek,
  getBookLabel,
  getComeFollowMeWeekByStart,
  getLessonCover,
  lessonNoteSource,
  readingGroups,
  scriptureAnchor,
  verseRangeLabel,
  weekReading,
  type ComeFollowMeWeek,
  type LessonCover,
  type NoteSource,
  type VerseAnnotation,
  type VerseTextRange,
} from "../../../src/shared/web";
import { useTheme } from "../../../src/theme/theme";
import { fonts } from "../../../src/theme/tokens";
import { useStudyIdentity } from "../../../src/storage/studySession";

const ATTRIBUTION = "Written in collaboration with agents";
const SOURCE_SITE = "https://www.isaacstuff.com/cfm";

/** Anything the contents and passage links can scroll to: a block's view, or a verse within a passage's text. */
type Anchor = Pick<AnchorElement, "measureLayout">;
type Register = (id: string, element: Anchor | null) => void;

function useAnchors() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const anchors = useRef(new Map<string, Anchor>());
  const register: Register = useCallback((id: string, element: Anchor | null) => {
    if (element) anchors.current.set(id, element);
    else anchors.current.delete(id);
  }, []);
  const scrollTo = useCallback((id: string, offset = 84) => {
    const element = anchors.current.get(id);
    const content = contentRef.current;
    if (!element || !content) return false;
    element.measureLayout(
      content,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - offset), animated: true }),
      () => {}
    );
    return true;
  }, []);
  return { scrollRef, contentRef, register, scrollTo };
}

function Hero({ cover, meta, title, summary, onBack, actions }: { cover: LessonCover; meta: string[]; title: string; summary?: string; onBack: () => void; actions: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ marginHorizontal: -16, aspectRatio: 16 / 9, backgroundColor: colors.surfaceCardSoft, overflow: "hidden" }}>
        <LessonCoverImage cover={cover} />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "45%", backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), ${colors.background})` }} />
        <PaintingCaption cover={cover} />
      </View>
      <Pressable accessibilityRole="link" onPress={onBack} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundSoft }}>← All lessons</Text>
      </Pressable>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 18, letterSpacing: 1.7, textTransform: "uppercase", color: colors.accentRubric }}>
        {meta.map((item, index) => (
          <Text key={item} style={index ? { color: colors.foregroundSoft } : undefined}>
            {index ? <Text style={{ color: colors.ruleStrong }}>{"  ·  "}</Text> : null}
            {item}
          </Text>
        ))}
      </Text>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 34, lineHeight: 38, color: colors.foreground }}>
        {title}
      </Text>
      {summary ? <Text style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 29, color: colors.foregroundMuted }}>{summary}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions}</View>
    </View>
  );
}

function WeekNav({ week }: { week: ComeFollowMeWeek }) {
  const router = useRouter();
  const { colors } = useTheme();
  const previous = getAdjacentWeek(week, -1);
  const next = getAdjacentWeek(week, 1);
  const link = (target: ComeFollowMeWeek, label: string, align: "left" | "right") => (
    <Pressable accessibilityRole="link" accessibilityLabel={`${align === "left" ? "Previous" : "Next"} week: ${target.block}`} onPress={() => router.replace(`/come-follow-me/${target.start}` as never)} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
      <Text style={{ textAlign: align, fontFamily: fonts.serif, fontSize: 16.8, color: colors.foreground }}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityLabel="Other weeks" style={{ flexDirection: "row", gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.rule }}>
      {previous ? link(previous, `← ${previous.block}`, "left") : <View style={{ flex: 1 }} />}
      {next ? link(next, `${next.block} →`, "right") : <View style={{ flex: 1 }} />}
    </View>
  );
}

function ContextDisclosure({ block, register, open, onToggle }: { block: GuideContextBlock; register: Register; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const [more, setMore] = useState(false);
  const verses = block.passage?.label.replace(/^.*?:/, "") ?? "";
  const label = block.passage ? `Context for ${block.passage.first === block.passage.last && !/[–-]/.test(verses) ? "verse" : "verses"} ${verses}` : "Chapter context";
  return (
    <View ref={(element) => register(block.id, element)} collapsable={false} style={{ borderTopWidth: 1, borderTopColor: colors.rule, marginTop: 6 }}>
      <Pressable
        testID={`context-${block.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={11} color={colors.foregroundMuted} />
        <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.foregroundMuted }}>{label}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 14, paddingBottom: 14 }}>
          <GuideProse blocks={block.preview} root={rootKey.preview(block.id)} />
          {block.more.length ? (
            <>
              {more ? <GuideProse blocks={block.more} root={rootKey.more(block.id)} /> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.accentRubric }}>{more ? "Show less commentary" : "Read full commentary"}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** One of the week's chapters, in its own book: `entry.key` is how the guide names it (see RangeEntry). */
type ChapterData = { entry: RangeEntry; bookLabel: string; verses: Verse[]; annotations: ReadonlyMap<number, VerseAnnotation> };

/** The selected words, in one passage of one of the week's chapters (by its range key, never just its number). */
type GuideSelection = { key: number; group: string; ranges: VerseTextRange[] };

/**
 * One continuous passage of a chapter (the verses before a context block) as one selectable text, so a phrase can
 * be selected across its verses, with the reader's notes beneath their verses and their marks on the exact words.
 * Each verse is still an anchor the contents and passage links scroll to.
 */
function GuidePassage({
  data,
  verses,
  selection,
  onSelect,
  flash,
  register,
}: {
  data: ChapterData;
  verses: Verse[];
  selection: VerseTextRange[] | null;
  onSelect: (ranges: VerseTextRange[] | null) => void;
  flash: { first: number; last: number } | null;
  register: Register;
}) {
  const { colors } = useTheme();
  const box = useRef<ComponentRef<typeof View>>(null);
  const text = useRef<ScriptureTextHandle>(null);
  const { entry, annotations } = data;
  const style: ScriptureStyle = useMemo(
    () => ({
      body: { font: fonts.serif, size: 18, lineHeight: 18 * 1.65, color: colors.foreground },
      number: { font: fonts.sansSemiBold, size: 11, color: colors.accentRubric },
      verseSpacing: 10,
      note: {
        layout: "inline",
        label: { font: fonts.sansSemiBold, size: 13.5, color: colors.foregroundMuted },
        body: { font: fonts.sans, size: 13.5, lineHeight: 20, color: colors.foregroundMuted },
        gap: 4,
      },
    }),
    [colors]
  );
  const notesKey = verses.map((verse) => annotations.get(verse.verse)?.body?.trim() ?? "").join("\u0001");
  const document = useMemo(
    () => buildScriptureDocument(verses.map((verse) => ({ verse: verse.verse, text: verse.text, note: annotations.get(verse.verse)?.body })), style),
    // The notes are read through notesKey: a mark going on or off keeps the same text (and the selection).
    [verses, notesKey, style]
  );
  const marks = useMemo(() => documentMarks(document, (verse) => annotations.get(verse)), [document, annotations]);
  const decorations: DocumentDecoration[] = useMemo(
    () =>
      flash
        ? document.verses
            .filter((region) => region.verse >= flash.first && region.verse <= flash.last)
            .map((region) => ({ start: region.blockStart, end: region.blockEnd, kind: "box" as const, fill: colors.footnoteHighlightActive, radius: 6, outsetX: 8, outsetTop: 3, outsetBottom: 3 }))
        : [],
    [document, flash, colors]
  );

  useEffect(() => {
    const ids = verses.map((verse) => {
      const id = scriptureAnchor(entry.slug, entry.chapter, verse.verse);
      register(id, {
        measureLayout: (relative, onSuccess, onFail) =>
          box.current?.measureLayout(
            relative,
            (x, y, width, height) => {
              void (text.current?.verseTop(verse.verse) ?? Promise.resolve(-1)).then((top) => onSuccess(x, y + Math.max(0, top), width, height));
            },
            onFail
          ),
      });
      return id;
    });
    return () => ids.forEach((id) => register(id, null));
  }, [verses, entry, register]);

  return (
    <View ref={box} collapsable={false} style={{ marginHorizontal: -8 }}>
      <ScriptureText
        ref={text}
        testID={`guide-text-${entry.slug}-${entry.chapter}-${verses[0]?.verse}`}
        document={document}
        marks={marks}
        decorations={decorations}
        selection={selection}
        onSelectionChange={onSelect}
        textInset={[8, 8]}
      />
    </View>
  );
}

function GuideStudy({ guide, week }: { guide: NativeGuide; week: ComeFollowMeWeek }) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { anchor } = useLocalSearchParams<{ anchor?: string }>();
  const bottom = useBottomClearance();
  const { scrollRef, contentRef, register, scrollTo } = useAnchors();
  const [openContexts, setOpenContexts] = useState<Set<string>>(new Set());
  const [contentsOpen, setContentsOpen] = useState(false);
  // Both keyed by the chapter's range key, so a verse of Lamentations 1 is never Jeremiah 1's.
  const [flash, setFlash] = useState<{ key: number; first: number; last: number } | null>(null);
  const [selection, setSelection] = useState<GuideSelection | null>(null);
  const cover = getLessonCover(week.start);
  const { range } = guide;
  const guideSource = lessonNoteSource(week.start, `${guide.scripture}: ${guide.title}`) as NoteSource;

  // Keyed by range key, so Lamentations 1's annotations are never Jeremiah 1's.
  const verseAnnotations = useLessonVerseAnnotations(range.entries);
  const chapters: ChapterData[] = useMemo(
    () =>
      range.entries.map((entry) => ({
        entry,
        bookLabel: getBookLabel(entry.volume, entry.slug),
        verses: getChapter(entry.volume, entry.slug, entry.chapter)?.verses ?? [],
        annotations: verseAnnotations.get(entry.key) ?? new Map(),
      })),
    [range, verseAnnotations]
  );
  const sectionByChapter = useMemo(() => new Map(guide.sections.filter((section) => section.chapter != null).map((section) => [section.chapter!, section])), [guide]);
  // A passage id → the context block, so the contents can open what it points at.
  const blockById = useMemo(() => new Map(guide.sections.flatMap((section) => section.blocks.map((block) => [block.id, block] as const))), [guide]);

  const goToId = useCallback(
    (id: string) => {
      if (blockById.has(id)) setOpenContexts((current) => new Set(current).add(id));
      // Let an opened disclosure lay out before measuring.
      setTimeout(() => scrollTo(id), 80);
    },
    [blockById, scrollTo]
  );
  const onRef = useCallback(
    (ref: PassageRef) => {
      const entry = ref.local ? range.entries.find((item) => item.volume === ref.volume && item.slug === ref.book && item.chapter === ref.chapter) : undefined;
      if (entry) {
        scrollTo(scriptureAnchor(entry.slug, entry.chapter, ref.first));
        if (ref.first) {
          setFlash({ key: entry.key, first: ref.first, last: ref.last ?? ref.first });
          setTimeout(() => setFlash(null), 2600);
        }
        return;
      }
      router.push(chapterPath(ref.volume, ref.book, ref.chapter, ref.first) as never);
    },
    [range, router, scrollTo]
  );
  const links = useMemo(() => ({ onRef, onAnchor: goToId }), [onRef, goToId]);
  // The guide's prose: its saved spans (this device's, or the account's) and the one prose selection. Selecting prose
  // ends a scripture selection, and selecting scripture ends a prose selection.
  const guideAnnotations = useGuideAnnotations(week.start);
  const prose = useGuideProse(guide, guideAnnotations.rows, links, register, () => setSelection(null));

  useEffect(() => {
    if (!anchor) return;
    const timer = setTimeout(() => goToId(String(anchor)), 400);
    return () => clearTimeout(timer);
  }, [anchor, goToId]);

  const toggleContext = (id: string) =>
    setOpenContexts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openComposer = (reading: boolean) => {
    setDraftIntent({ source: guideSource, body: "", reading });
    router.push("/notes/new");
  };

  const selectIn = (key: number, group: string) => (ranges: VerseTextRange[] | null) => {
    if (ranges) prose.clear();
    setSelection((current) => (ranges ? { key, group, ranges } : current?.key === key && current.group === group ? null : current));
  };

  const renderChapter = (data: ChapterData) => {
    const { entry, bookLabel } = data;
    const section = sectionByChapter.get(entry.key);
    const sectionIndex = section ? guide.sections.indexOf(section) : -1;
    const following: GuideSection[] = [];
    for (let index = sectionIndex + 1; sectionIndex >= 0 && index < guide.sections.length; index++) {
      if (guide.sections[index].chapter != null) break;
      following.push(guide.sections[index]);
    }
    const blocks = section?.blocks ?? [];
    // The web's own grouping (scriptureFirst.ts): every verse once, each comment after the verses it covers.
    const groups = readingGroups(data.verses, blocks as never).map((group) => ({ ...group, block: group.context ? blocks.find((block) => block.id === group.context!.id) : undefined }));
    return (
      <View key={entry.key} testID={`guide-chapter-${entry.slug}-${entry.chapter}`} ref={(element) => register(scriptureAnchor(entry.slug, entry.chapter), element)} collapsable={false} style={{ gap: 14, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.rule }}>
        {section ? (
          <GuideProse blocks={section.heading} root={rootKey.section(section.id)} />
        ) : (
          <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.foreground }}>
            {bookLabel} {entry.chapter}
          </Text>
        )}
        {data.verses.length === 0 ? <Notice tone="warning">{`${bookLabel} ${entry.chapter} isn't in the scripture library.`}</Notice> : null}
        {groups.map((group) => (
          <View key={group.id} style={{ gap: 6 }}>
            {group.verses.length ? (
              <>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.accentRubric }}>
                  {verseRangeLabel(group.verses[0].verse, group.verses[group.verses.length - 1].verse)}
                </Text>
                <GuidePassage
                  data={data}
                  verses={group.verses}
                  selection={selection?.key === entry.key && selection.group === group.id ? selection.ranges : null}
                  onSelect={selectIn(entry.key, group.id)}
                  flash={flash?.key === entry.key ? flash : null}
                  register={register}
                />
              </>
            ) : null}
            {group.block ? <ContextDisclosure block={group.block} register={register} open={openContexts.has(group.block.id)} onToggle={() => toggleContext(group.block!.id)} /> : null}
          </View>
        ))}
        <Text
          accessibilityRole="link"
          onPress={() => router.push(chapterPath(entry.volume, entry.slug, entry.chapter) as never)}
          style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundSoft, textDecorationLine: "underline", textDecorationColor: colors.accentRubricLine, paddingVertical: 8 }}
        >
          Open {bookLabel} {entry.chapter} in the reader
        </Text>
        {following.map((extra) => (
          <View key={extra.id} style={{ gap: 10 }}>
            <GuideProse blocks={extra.heading} root={rootKey.section(extra.id)} />
            {extra.blocks.map((block) => (
              <ContextDisclosure key={block.id} block={block} register={register} open={openContexts.has(block.id)} onToggle={() => toggleContext(block.id)} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const selectedChapter = selection ? chapters.find((data) => data.entry.key === selection.key) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GuideProseProvider state={prose.state}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom + (selection || prose.selection ? 260 : 0) }}>
        <View ref={contentRef} collapsable={false} style={{ paddingHorizontal: 16, gap: 22, width: "100%", maxWidth: 736, alignSelf: "center" }}>
          <Hero
            cover={cover}
            meta={[guide.scripture, guide.dateLabel]}
            title={guide.title}
            summary={guide.summary}
            onBack={() => router.navigate("/come-follow-me")}
            actions={
              <>
                <Button variant="secondary" icon="list" label="Contents" onPress={() => setContentsOpen(true)} testID="guide-contents" />
                <Button variant="secondary" icon="pen" label="Add note" onPress={() => openComposer(false)} />
                <Button variant="secondary" icon="book-open" label="Log reading" onPress={() => openComposer(true)} />
              </>
            }
          />
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.foregroundSoft }}>{guide.readingTime}</Text>
          {guide.introduction.length ? <GuideProse blocks={guide.introduction} root={rootKey.introduction} /> : null}
          <Text style={{ fontFamily: fonts.serif, fontStyle: "italic", fontSize: 17, color: colors.foregroundSoft }}>Read the scriptures. Open the context as you go.</Text>
          {guide.sections.length === 0 && guide.fallback.length ? <GuideProse blocks={guide.fallback} root={rootKey.fallback} /> : null}
          {chapters.map(renderChapter)}
          {guide.closing.length ? (
            <View style={{ paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.rule }}>
              <GuideProse blocks={guide.closing} root={rootKey.closing} />
            </View>
          ) : null}
          <View style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.rule }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: colors.foregroundSoft }}>
              <Text style={{ fontFamily: fonts.sansSemiBold }}>{ATTRIBUTION}</Text>. Guide by {guide.author}. Scripture text is the King James Version from Verse Together's local library.
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: colors.foregroundSoft }}>
              Originally published at{" "}
              <Text accessibilityRole="link" onPress={() => void openExternal(SOURCE_SITE)} style={{ textDecorationLine: "underline" }}>
                isaacstuff.com/cfm
              </Text>
              .
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: colors.foregroundSoft }}>
              Cover: <CoverCredit cover={cover} />
            </Text>
            <WeekNav week={week} />
          </View>
        </View>
      </ScrollView>
      </GuideProseProvider>
      <PillBar style={{ position: "absolute", top: Math.max(insets.top, 12) + 4, right: 12 }}>
        <IconButton icon="list" label="Contents" onPress={() => setContentsOpen(true)} />
        <IconButton icon="pen" label="Add note to this lesson" onPress={() => openComposer(false)} />
      </PillBar>
      {selection && selectedChapter ? (
        <VerseActions
          volume={selectedChapter.entry.volume}
          book={selectedChapter.entry.slug}
          bookLabel={selectedChapter.bookLabel}
          chapter={selectedChapter.entry.chapter}
          verses={selectedChapter.verses}
          annotations={selectedChapter.annotations}
          ranges={selection.ranges}
          onClear={() => setSelection(null)}
        />
      ) : null}
      {prose.selection ? (
        <GuideActions
          guide={week.start}
          noteSource={guideSource}
          selection={prose.selection}
          annotations={guideAnnotations}
          placed={prose.selection.part ? prose.placed[prose.selection.part] : []}
          onClear={prose.clear}
          onSelectSaved={(item) => prose.selectSpan(item.row.part, item.start, item.end)}
        />
      ) : null}
      <Sheet visible={contentsOpen} onClose={() => setContentsOpen(false)} title="Contents" testID="guide-toc">
        {guide.toc.map((item) => (
          <View key={item.id} style={{ gap: 2 }}>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                setContentsOpen(false);
                // A chapter heading of the week's own reading goes to its scripture, in its own book.
                const entry = item.key != null ? range.entries.find((candidate) => candidate.key === item.key) : undefined;
                goToId(entry && item.part === "reader" ? scriptureAnchor(entry.slug, entry.chapter) : item.id);
              }}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: item.kind === "chapter" ? fonts.serif : fonts.sansSemiBold, fontSize: item.kind === "chapter" ? 18 : 14.5, color: colors.foreground }}>{item.text}</Text>
            </Pressable>
            {item.verses.map((verse) => (
              <Pressable
                key={verse.id}
                accessibilityRole="link"
                accessibilityLabel={`${verse.short} ${verse.text}`}
                onPress={() => {
                  setContentsOpen(false);
                  goToId(verse.id);
                }}
                style={{ minHeight: 40, justifyContent: "center", paddingLeft: 14 }}
              >
                <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 13.5, color: colors.foregroundMuted }}>
                  <Text style={{ color: colors.accentRubric }}>{verse.short}</Text> {verse.text}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Sheet>
    </View>
  );
}

function NoGuide({ week }: { week: ComeFollowMeWeek }) {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomClearance();
  const cover = getLessonCover(week.start);
  const ranges = weekReading(week);
  const source = lessonNoteSource(week.start, week.block) as NoteSource;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}>
      <View style={{ paddingHorizontal: 16, gap: 22, width: "100%", maxWidth: 736, alignSelf: "center" }}>
        <Hero
          cover={cover}
          meta={["Come, Follow Me", formatWeekRange(week)]}
          title={week.block}
          onBack={() => router.navigate("/come-follow-me")}
          actions={
            <Button
              variant="secondary"
              icon="pen"
              label="Add note"
              onPress={() => {
                setDraftIntent({ source, body: "", reading: false });
                router.push("/notes/new");
              }}
            />
          }
        />
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 29, color: colors.foregroundMuted }}>
          {week.suggestion ? `${week.suggestion.note}. ` : ""}There is no study guide for this week yet. You can still read the assigned scripture.
        </Text>
        <LessonChapters ranges={ranges} />
        <View style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.rule }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: colors.foregroundSoft }}>
            Cover: <CoverCredit cover={cover} />
          </Text>
          <WeekNav week={week} />
        </View>
      </View>
    </ScrollView>
  );
}

export default function LessonScreen() {
  const { weekStart } = useLocalSearchParams<{ weekStart: string }>();
  const router = useRouter();
  const identity = useStudyIdentity();
  const week = getComeFollowMeWeekByStart(String(weekStart));
  if (!week) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: 80, gap: 12 }}>
        <Notice tone="warning">There is no Come, Follow Me lesson for that week.</Notice>
        <Button variant="secondary" label="All lessons" onPress={() => router.replace("/come-follow-me")} />
      </View>
    );
  }
  const guide = getNativeGuide(week.start);
  return guide ? <GuideStudy key={`${week.start}:${identity}`} guide={guide} week={week} /> : <NoGuide key={`${week.start}:${identity}`} week={week} />;
}
