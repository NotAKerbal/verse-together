// The web app's pure TypeScript modules the native app runs unchanged: browse routes and the scripture catalog,
// the Come, Follow Me schedule and lessons, passage references and share links, verse-mark rules (and the exact
// text-range offsets a selection is saved with), and the device journal store (with its account import shapes). Each is free of DOM, Next.js and React DOM code; keeping them shared means both apps
// apply the same rules (and the web suites already test them).

export { scriptureCatalog } from "@/lib/scriptureCatalog";
export type { CatalogBook, CatalogVolume } from "@/lib/scriptureCatalogIndex";
export {
  browseBookEntryHref,
  browseBookBackHref,
  browseChapterHref,
  buildBookView,
  buildChapterChrome,
  buildLibraryVolumes,
  buildVolumeBooks,
  parseBrowseChapterHref,
  parseBrowseSelection,
  singleChapterBookHref,
  type BookView,
  type ChapterChrome,
  type LibraryVolumeItem,
  type VolumeBookItem,
} from "@/lib/browseRoutes";
export { getScriptureVolumeLabel, normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "@/lib/scriptureVolumes";
export { getScriptureBookArt } from "@/lib/scriptureBookArt";
export {
  COME_FOLLOW_ME_WEEKS,
  formatWeekRange,
  getAdjacentWeek,
  getComeFollowMeWeek,
  getComeFollowMeWeekByStart,
  toLocalDateKey,
  type ChapterRange,
  type ComeFollowMeWeek,
} from "@/lib/comeFollowMe";
export {
  getLessonForWeek,
  getLessonOverview,
  lessonNoteSource,
  weekReading,
  type Lesson,
  type LessonGuide,
  type LessonOverview,
  type ScheduleStatus,
} from "@/features/comeFollowMe/lessons";
export { FALLBACK_COVER, getLessonCover, shortCoverCredit, type LessonCover } from "@/features/comeFollowMe/lessonCovers";
export { readingGroups, verseRangeLabel, type ReadingGroup } from "@/features/comeFollowMe/scriptureFirst";
export { scriptureAnchor } from "@/lib/cfm/cfmAnchors";
export {
  buildShareUrl,
  formatPassageReference,
  groupVerseRuns,
  parseVerseSpec,
  serializeVerseSpec,
} from "@/lib/passageShare";
export { getQuickNavSuggestions, parseScriptureReferenceQuery, type QuickNavSuggestion } from "@/lib/scriptureQuickNav";
export { getBookLabel, getChapterHref, formatChapterLabel } from "@/features/plans/scriptureCatalog";
export {
  ANNOTATION_BODY_MAX,
  DEFAULT_MARK_PRESETS,
  MARK_COLORS,
  MARK_KINDS,
  annotationProblem,
  applyVerseMarks,
  DEFAULT_UNDERLINE_COLOR,
  normalizeAnnotationBody,
  verseMarksProblem,
  MARK_PRESETS_MAX,
  isMarkColor,
  matchingTextMarks,
  markPresetKey,
  normalizeMarkPresets,
  readMarkPresets,
  sameMarkPreset,
  type MarkColor,
  type MarkKind,
  type MarkPreset,
  type GuideAnchorFields,
  type GuideAnnotationPatch,
  type VerseMarksPatch,
  type VerseTextMark,
  type VerseTextRange,
} from "../../../convex/annotationRules";
export { readGuideHighlight, type GuideHighlight } from "@/features/comeFollowMe/guideAnchors";
export { scriptureSourceOffsets, selectedVersePassages } from "@/lib/verseSelection";
export {
  annotationChapter,
  deviceChapterAnnotations,
  highlightOf,
  markColorLabel,
  markPresetFullLabel,
  markPresetLabel,
  markPresetPhrase,
  myAnnotationsByVerse,
  presetState,
  quickMarkPatch,
  selectionMarks,
  underlineColorOf,
  type AnnotationChapter,
  type AnnotationVerse,
  type ChapterAnnotations,
  type SelectionMarks,
  type VerseAnnotation,
} from "@/features/annotations/verseAnnotations";
export { MARK_SWATCH_HEX, customMarkColors, isCustomMarkColor, markColorHex } from "@/features/annotations/markColors";
export {
  DeviceStudyStore,
  EMPTY_DEVICE_STUDY,
  DEVICE_STUDY_KEY,
  annotationImport,
  deviceJournal,
  guideHighlightImport,
  type DeviceAnnotation,
  type DeviceHighlight,
  type DeviceNote,
  type DeviceStudy,
} from "@/features/notes/deviceStudy";
export { RevisionConflictError } from "@/features/notes/journalOutbox";
export {
  dateFromKey,
  entryKey,
  entryTime,
  formatDayHeading,
  formatMonthHeading,
  formatShortDayHeading,
  formatTime,
  localDateKey,
  monthGrid,
  monthKeyOf,
  newRequestId,
  readingEntryFromRow,
  shiftMonth,
  sourceKindLabel,
  type JournalAnnotationEntry,
  type JournalEntry,
  type JournalNoteDocument,
  type JournalNoteEntry,
  type JournalReadingEntry,
  type NoteSource,
  type ReadingLogRow,
} from "@/features/notes/journal";
export { hasReflection, journalGoalWeek, journalHomeProgress, journalRevisit, REFLECTION_PROMPTS } from "@/features/notes/journalHome";
export { DEFAULT_JOURNAL_GOALS, MAX_WEEKLY_REFLECTIONS, journalGoalsProblem, type JournalGoals } from "@/lib/journalGoals";
export { deriveNoteTitle, markdownExcerpt, NOTE_MARKDOWN_MAX, scriptureSource } from "../../../convex/noteJournal";
export { scriptureExcerpt, quotedExcerpt } from "@/features/notes/noteExcerpts";
