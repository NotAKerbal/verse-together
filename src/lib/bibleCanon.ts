export type BibleTestament = "old" | "new";

export type BibleBook = {
  slug: string;
  id: string;
  label: string;
  testament: BibleTestament;
  chapters: number;
};

export const BIBLE_BOOKS: BibleBook[] = [
  { slug: "genesis", id: "GEN", label: "Genesis", testament: "old", chapters: 50 },
  { slug: "exodus", id: "EXO", label: "Exodus", testament: "old", chapters: 40 },
  { slug: "leviticus", id: "LEV", label: "Leviticus", testament: "old", chapters: 27 },
  { slug: "numbers", id: "NUM", label: "Numbers", testament: "old", chapters: 36 },
  { slug: "deuteronomy", id: "DEU", label: "Deuteronomy", testament: "old", chapters: 34 },
  { slug: "joshua", id: "JOS", label: "Joshua", testament: "old", chapters: 24 },
  { slug: "judges", id: "JDG", label: "Judges", testament: "old", chapters: 21 },
  { slug: "ruth", id: "RUT", label: "Ruth", testament: "old", chapters: 4 },
  { slug: "1samuel", id: "1SA", label: "1 Samuel", testament: "old", chapters: 31 },
  { slug: "2samuel", id: "2SA", label: "2 Samuel", testament: "old", chapters: 24 },
  { slug: "1kings", id: "1KI", label: "1 Kings", testament: "old", chapters: 22 },
  { slug: "2kings", id: "2KI", label: "2 Kings", testament: "old", chapters: 25 },
  { slug: "1chronicles", id: "1CH", label: "1 Chronicles", testament: "old", chapters: 29 },
  { slug: "2chronicles", id: "2CH", label: "2 Chronicles", testament: "old", chapters: 36 },
  { slug: "ezra", id: "EZR", label: "Ezra", testament: "old", chapters: 10 },
  { slug: "nehemiah", id: "NEH", label: "Nehemiah", testament: "old", chapters: 13 },
  { slug: "esther", id: "EST", label: "Esther", testament: "old", chapters: 10 },
  { slug: "job", id: "JOB", label: "Job", testament: "old", chapters: 42 },
  { slug: "psalms", id: "PSA", label: "Psalms", testament: "old", chapters: 150 },
  { slug: "proverbs", id: "PRO", label: "Proverbs", testament: "old", chapters: 31 },
  { slug: "ecclesiastes", id: "ECC", label: "Ecclesiastes", testament: "old", chapters: 12 },
  { slug: "songofsolomon", id: "SNG", label: "Song of Solomon", testament: "old", chapters: 8 },
  { slug: "isaiah", id: "ISA", label: "Isaiah", testament: "old", chapters: 66 },
  { slug: "jeremiah", id: "JER", label: "Jeremiah", testament: "old", chapters: 52 },
  { slug: "lamentations", id: "LAM", label: "Lamentations", testament: "old", chapters: 5 },
  { slug: "ezekiel", id: "EZK", label: "Ezekiel", testament: "old", chapters: 48 },
  { slug: "daniel", id: "DAN", label: "Daniel", testament: "old", chapters: 12 },
  { slug: "hosea", id: "HOS", label: "Hosea", testament: "old", chapters: 14 },
  { slug: "joel", id: "JOL", label: "Joel", testament: "old", chapters: 3 },
  { slug: "amos", id: "AMO", label: "Amos", testament: "old", chapters: 9 },
  { slug: "obadiah", id: "OBA", label: "Obadiah", testament: "old", chapters: 1 },
  { slug: "jonah", id: "JON", label: "Jonah", testament: "old", chapters: 4 },
  { slug: "micah", id: "MIC", label: "Micah", testament: "old", chapters: 7 },
  { slug: "nahum", id: "NAM", label: "Nahum", testament: "old", chapters: 3 },
  { slug: "habakkuk", id: "HAB", label: "Habakkuk", testament: "old", chapters: 3 },
  { slug: "zephaniah", id: "ZEP", label: "Zephaniah", testament: "old", chapters: 3 },
  { slug: "haggai", id: "HAG", label: "Haggai", testament: "old", chapters: 2 },
  { slug: "zechariah", id: "ZEC", label: "Zechariah", testament: "old", chapters: 14 },
  { slug: "malachi", id: "MAL", label: "Malachi", testament: "old", chapters: 4 },
  { slug: "matthew", id: "MAT", label: "Matthew", testament: "new", chapters: 28 },
  { slug: "mark", id: "MRK", label: "Mark", testament: "new", chapters: 16 },
  { slug: "luke", id: "LUK", label: "Luke", testament: "new", chapters: 24 },
  { slug: "john", id: "JHN", label: "John", testament: "new", chapters: 21 },
  { slug: "acts", id: "ACT", label: "Acts", testament: "new", chapters: 28 },
  { slug: "romans", id: "ROM", label: "Romans", testament: "new", chapters: 16 },
  { slug: "1corinthians", id: "1CO", label: "1 Corinthians", testament: "new", chapters: 16 },
  { slug: "2corinthians", id: "2CO", label: "2 Corinthians", testament: "new", chapters: 13 },
  { slug: "galatians", id: "GAL", label: "Galatians", testament: "new", chapters: 6 },
  { slug: "ephesians", id: "EPH", label: "Ephesians", testament: "new", chapters: 6 },
  { slug: "philippians", id: "PHP", label: "Philippians", testament: "new", chapters: 4 },
  { slug: "colossians", id: "COL", label: "Colossians", testament: "new", chapters: 4 },
  { slug: "1thessalonians", id: "1TH", label: "1 Thessalonians", testament: "new", chapters: 5 },
  { slug: "2thessalonians", id: "2TH", label: "2 Thessalonians", testament: "new", chapters: 3 },
  { slug: "1timothy", id: "1TI", label: "1 Timothy", testament: "new", chapters: 6 },
  { slug: "2timothy", id: "2TI", label: "2 Timothy", testament: "new", chapters: 4 },
  { slug: "titus", id: "TIT", label: "Titus", testament: "new", chapters: 3 },
  { slug: "philemon", id: "PHM", label: "Philemon", testament: "new", chapters: 1 },
  { slug: "hebrews", id: "HEB", label: "Hebrews", testament: "new", chapters: 13 },
  { slug: "james", id: "JAS", label: "James", testament: "new", chapters: 5 },
  { slug: "1peter", id: "1PE", label: "1 Peter", testament: "new", chapters: 5 },
  { slug: "2peter", id: "2PE", label: "2 Peter", testament: "new", chapters: 3 },
  { slug: "1john", id: "1JN", label: "1 John", testament: "new", chapters: 5 },
  { slug: "2john", id: "2JN", label: "2 John", testament: "new", chapters: 1 },
  { slug: "3john", id: "3JN", label: "3 John", testament: "new", chapters: 1 },
  { slug: "jude", id: "JUD", label: "Jude", testament: "new", chapters: 1 },
  { slug: "revelation", id: "REV", label: "Revelation", testament: "new", chapters: 22 },
];

export const BIBLE_TRANSLATION_OPTIONS = [
  { id: "kjv", label: "King James Version" },
  { id: "web", label: "World English Bible" },
  { id: "asv", label: "American Standard Version" },
  { id: "bbe", label: "Bible in Basic English" },
  { id: "darby", label: "Darby Bible" },
  { id: "dra", label: "Douay-Rheims" },
  { id: "webbe", label: "World English Bible (British)" },
  { id: "oeb-us", label: "Open English Bible (US)" },
  { id: "oeb-cw", label: "Open English Bible (Commonwealth)" },
] as const;

const SUPPORTED_TRANSLATIONS = new Set<string>(BIBLE_TRANSLATION_OPTIONS.map((item) => item.id));

export function isBibleVolume(volume: string): boolean {
  return volume === "oldtestament" || volume === "newtestament";
}

export function getBibleBooksForVolume(volume: string): BibleBook[] {
  if (volume === "oldtestament") return BIBLE_BOOKS.filter((book) => book.testament === "old");
  if (volume === "newtestament") return BIBLE_BOOKS.filter((book) => book.testament === "new");
  return [];
}

export function getBibleBookBySlug(slug: string): BibleBook | undefined {
  return BIBLE_BOOKS.find((book) => book.slug === slug);
}

export function normalizeBibleTranslationId(value: string | null | undefined): string {
  if (!value) return "kjv";
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_TRANSLATIONS.has(normalized)) return normalized;
  return "kjv";
}
