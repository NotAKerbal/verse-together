import type { CitationTalk, VerseCitations } from "@/lib/citations";

export type ScriptureResourceType = "verse" | "verse_range" | "chapter" | "chapter_range";

export type ScriptureResourceScope = {
  book: string;
  bookEnd: string;
  bookOrder?: number;
  bookEndOrder?: number;
  resourceType: ScriptureResourceType;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number | null;
  verseEnd: number | null;
};

export type CitationSelectionContext = {
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verseSpec: string;
  selectedVerses: number[];
  selectedText?: string;
};

export type ScriptureResource = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  coverages: ScriptureResourceScope[];
  matchedScopes: ScriptureResourceScope[];
};

export type CitationsQueryRequest = {
  selection: CitationSelectionContext;
};

export type CitationsResponse = VerseCitations & {
  selection: CitationSelectionContext;
  talks: CitationTalk[];
  resources: ScriptureResource[];
};

export type CreateScriptureResourceRequest = {
  volume: string;
  title: string;
  description?: string;
  url?: string;
  coverages: ScriptureResourceScope[];
};
