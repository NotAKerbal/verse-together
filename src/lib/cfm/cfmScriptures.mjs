// Scripture reference detection and VerseTogether passage URLs for CFM guides.
// Render-time only: source Markdown is never modified.
//
// Adapted from lib/cfm-scriptures.mjs in NotAKerbal/isaac-stuff-homepage at
// 52975b1c4b78c34a1c0d7af365422455b71148e4. The only change: passage URLs are site-relative, since
// this module now runs inside VerseTogether itself.

// [volume path, url abbreviation, chapter (D&C: section) count, names...]. Names are matched case-sensitively.
const CANON = [
  ['ot', 'gen', 50, 'Genesis'], ['ot', 'ex', 40, 'Exodus'], ['ot', 'lev', 27, 'Leviticus'], ['ot', 'num', 36, 'Numbers'],
  ['ot', 'deut', 34, 'Deuteronomy'], ['ot', 'josh', 24, 'Joshua'], ['ot', 'judg', 21, 'Judges'], ['ot', 'ruth', 4, 'Ruth'],
  ['ot', '1-sam', 31, '1 Samuel'], ['ot', '2-sam', 24, '2 Samuel'], ['ot', '1-kgs', 22, '1 Kings'], ['ot', '2-kgs', 25, '2 Kings'],
  ['ot', '1-chr', 29, '1 Chronicles'], ['ot', '2-chr', 36, '2 Chronicles'], ['ot', 'ezra', 10, 'Ezra'], ['ot', 'neh', 13, 'Nehemiah'],
  ['ot', 'esth', 10, 'Esther'], ['ot', 'job', 42, 'Job'], ['ot', 'ps', 150, 'Psalms', 'Psalm'], ['ot', 'prov', 31, 'Proverbs'],
  ['ot', 'eccl', 12, 'Ecclesiastes'], ['ot', 'song', 8, 'Song of Solomon'], ['ot', 'isa', 66, 'Isaiah'], ['ot', 'jer', 52, 'Jeremiah'],
  ['ot', 'lam', 5, 'Lamentations'], ['ot', 'ezek', 48, 'Ezekiel'], ['ot', 'dan', 12, 'Daniel'], ['ot', 'hosea', 14, 'Hosea'],
  ['ot', 'joel', 3, 'Joel'], ['ot', 'amos', 9, 'Amos'], ['ot', 'obad', 1, 'Obadiah'], ['ot', 'jonah', 4, 'Jonah'],
  ['ot', 'micah', 7, 'Micah'], ['ot', 'nahum', 3, 'Nahum'], ['ot', 'hab', 3, 'Habakkuk'], ['ot', 'zeph', 3, 'Zephaniah'],
  ['ot', 'hag', 2, 'Haggai'], ['ot', 'zech', 14, 'Zechariah'], ['ot', 'mal', 4, 'Malachi'],
  ['nt', 'matt', 28, 'Matthew'], ['nt', 'mark', 16, 'Mark'], ['nt', 'luke', 24, 'Luke'], ['nt', 'john', 21, 'John'], ['nt', 'acts', 28, 'Acts'],
  ['nt', 'rom', 16, 'Romans'], ['nt', '1-cor', 16, '1 Corinthians'], ['nt', '2-cor', 13, '2 Corinthians'], ['nt', 'gal', 6, 'Galatians'],
  ['nt', 'eph', 6, 'Ephesians'], ['nt', 'philip', 4, 'Philippians'], ['nt', 'col', 4, 'Colossians'],
  ['nt', '1-thes', 5, '1 Thessalonians'], ['nt', '2-thes', 3, '2 Thessalonians'], ['nt', '1-tim', 6, '1 Timothy'],
  ['nt', '2-tim', 4, '2 Timothy'], ['nt', 'titus', 3, 'Titus'], ['nt', 'philem', 1, 'Philemon'], ['nt', 'heb', 13, 'Hebrews'],
  ['nt', 'james', 5, 'James'], ['nt', '1-pet', 5, '1 Peter'], ['nt', '2-pet', 3, '2 Peter'], ['nt', '1-jn', 5, '1 John'],
  ['nt', '2-jn', 1, '2 John'], ['nt', '3-jn', 1, '3 John'], ['nt', 'jude', 1, 'Jude'], ['nt', 'rev', 22, 'Revelation'],
  ['bofm', '1-ne', 22, '1 Nephi'], ['bofm', '2-ne', 33, '2 Nephi'], ['bofm', 'jacob', 7, 'Jacob'], ['bofm', 'enos', 1, 'Enos'],
  ['bofm', 'jarom', 1, 'Jarom'], ['bofm', 'omni', 1, 'Omni'], ['bofm', 'w-of-m', 1, 'Words of Mormon'], ['bofm', 'mosiah', 29, 'Mosiah'],
  ['bofm', 'alma', 63, 'Alma'], ['bofm', 'hel', 16, 'Helaman'], ['bofm', '3-ne', 30, '3 Nephi'], ['bofm', '4-ne', 1, '4 Nephi'],
  ['bofm', 'morm', 9, 'Mormon'], ['bofm', 'ether', 15, 'Ether'], ['bofm', 'moro', 10, 'Moroni'],
  ['dc-testament', 'dc', 138, 'Doctrine and Covenants', 'D&C'],
]
const BOOKS = new Map()
for (const [volume, abbr, chapters, ...names] of CANON) {
  // VerseTogether slug: first canonical name, lowercase, spaces removed ("1 Samuel" -> "1samuel").
  const book = { volume, abbr, chapters, slug: names[0].toLowerCase().replace(/\s+/g, '') }
  for (const name of names) BOOKS.set(name, { ...book, name })
}
const MAX_VERSE = 199

// Names that are also common words or personal names: link only with an explicit chapter:verse.
const NEEDS_VERSE = new Set(['Numbers', 'Judges', 'Ruth', 'Ezra', 'Job', 'Daniel', 'Joel', 'Amos', 'Jonah', 'Micah',
  'Mark', 'John', 'Acts', 'James', 'Jude', 'Titus', 'Jacob', 'Enos', 'Jarom', 'Omni', 'Mosiah', 'Alma', 'Helaman',
  'Mormon', 'Ether', 'Moroni'])

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NAMES = [...BOOKS.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
// Book, chapter, optional verse or same-chapter verse range (a/b suffixes allowed).
// The trailing guard rejects cross-chapter ranges ("52:13–53:12"), chapter ranges ("40–55"), and longer numbers.
const REF = String.raw`(${NAMES}) (\d{1,3})(?::(\d{1,3})[ab]?(?:[–-](\d{1,3})[ab]?)?)?(?![\w:]|[–-]\d)`
const REF_EXACT = new RegExp(String.raw`^${REF}$`)
const LOCAL_LEAD = /^(\d{1,3}):(\d{1,3})[ab]?(?:[–-](\d{1,3})[ab]?)?(?![\w:]|[–-]\d)/

// Whole named reference token, valid or not ("Isaiah 52:13–53:12", "Isaiah 40–55", "Isaiah 4000"), so an
// invalid named reference is consumed as a unit and never re-read as a bare chapter:verse.
const NAMED_SPAN = new RegExp(String.raw`(?<![\w&])(?:${NAMES}) \d+(?:[:–-]\d+[ab]?)*`, 'g')
// Bare "44:28" or same-chapter "7–8", never part of a larger number, path, decimal, time, or cross-chapter range.
const BARE = /(?<![\w:./–-])(\d{1,3}):(\d{1,3})[ab]?(?:[–-](\d{1,3})[ab]?)?(?![\w:]|[–-]\d|\.\d|\/| ?[ap]\.?m\b)/g
// Separators that continue a list of references for the same book ("John 5:30 and 8:28", "Romans 1:2; 3:4").
const CONTINUES = /^(?:[;,]\s*|\s+and\s+|,\s+and\s+)$/

export function findBook(name) { return BOOKS.get(name) }

const SITE = ''
const VOLUMES = { ot: 'oldtestament', nt: 'newtestament', bofm: 'bookofmormon', 'dc-testament': 'dnc' }

export function scriptureUrl(bookName, chapter, first, last) {
  const book = BOOKS.get(bookName)
  const ch = Number(chapter)
  if (!book || !Number.isInteger(ch) || ch < 1 || ch > book.chapters) return null
  const path = `${VOLUMES[book.volume]}/${book.slug}/${ch}`
  if (first == null) return `${SITE}/browse/${path}`
  const a = Number(first)
  const b = last == null ? a : Number(last)
  const verse = n => Number.isInteger(n) && n >= 1 && n <= MAX_VERSE
  if (!verse(a) || !verse(b) || b < a) return null
  return `${SITE}/share/${path}/${b > a ? `${a}-${b}` : a}`
}

function fromMatch(m) {
  const [, book, chapter, first, last] = m
  if (first == null && NEEDS_VERSE.has(BOOKS.get(book)?.name)) return null
  return scriptureUrl(book, chapter, first, last)
}

/** URL for a whole string that is exactly one reference, e.g. "Isaiah 50:1–3". */
export function referenceUrl(text) {
  const m = REF_EXACT.exec(text)
  return m ? fromMatch(m) : null
}

/** Leading "40:1–2" in a close-reading lead, only when it names the current chapter. */
export function matchLocalLead(text, chapter) {
  const m = LOCAL_LEAD.exec(text)
  if (!m || m[1] !== String(chapter)) return null
  return { text: m[0], chapter: m[1], first: m[2], last: m[3] }
}

// Mirrors marked's escape(): does not double-encode existing entities.
export function escapeHtml(text) {
  return text
    .replace(/&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function scriptureLink(url, html) {
  return `<a class="cfm-scripture" data-cfm-scripture href="${escapeHtml(url)}">${html}</a>`
}

/**
 * Escape raw text and link references. Visible text is unchanged.
 * Book-named references always link when valid. Bare "chapter:verse" references link only when
 * `contextBook` (a known book name) is supplied, and never when they continue a list that began with
 * a different named book ("3 Nephi 16:18–20 and 20:32–35").
 */
export function linkifyText(text, contextBook) {
  const spans = []
  for (const m of text.matchAll(NAMED_SPAN)) {
    const end = m.index + m[0].length
    const exact = /[\w:]/.test(text[end] ?? '') ? null : REF_EXACT.exec(m[0])
    spans.push({ start: m.index, end, book: BOOKS.get(m[0].match(new RegExp(`^(?:${NAMES})`))[0]), url: exact ? fromMatch(exact) : null })
  }
  const context = contextBook ? BOOKS.get(contextBook) : null
  if (context) {
    const named = [...spans]
    let prev = null // last reference before the current position: { end, foreign }
    let n = 0
    for (const m of text.matchAll(BARE)) {
      while (n < named.length && named[n].end <= m.index) { prev = { end: named[n].end, foreign: named[n].book.slug !== context.slug }; n++ }
      if (n < named.length && named[n].start < m.index + m[0].length) continue // inside a named span
      const continues = prev && CONTINUES.test(text.slice(prev.end, m.index))
      const foreign = continues && prev.foreign
      prev = { end: m.index + m[0].length, foreign }
      if (foreign) continue
      spans.push({ start: m.index, end: m.index + m[0].length, url: scriptureUrl(contextBook, m[1], m[2], m[3]) })
    }
    spans.sort((a, b) => a.start - b.start)
  }
  let out = ''
  let last = 0
  for (const span of spans) {
    if (!span.url) continue
    out += escapeHtml(text.slice(last, span.start)) + scriptureLink(span.url, escapeHtml(text.slice(span.start, span.end)))
    last = span.end
  }
  return out + escapeHtml(text.slice(last))
}

/** Mark text inside links and headings so it is never auto-linked (no nested anchors). */
export function markPlainTokens(tokens, plain = false) {
  for (const token of tokens ?? []) {
    if (plain) token.cfmPlain = true
    const inner = plain || token.type === 'link' || token.type === 'heading'
    markPlainTokens(token.tokens, inner)
    if (token.type === 'list') for (const item of token.items ?? []) markPlainTokens([item], inner)
    if (token.type === 'table') {
      for (const cell of token.header ?? []) markPlainTokens(cell.tokens, inner)
      for (const row of token.rows ?? []) for (const cell of row) markPlainTokens(cell.tokens, inner)
    }
  }
}

/** marked renderer.text override: returns false to fall back to marked's default. */
export function renderTextToken(token, contextBook) {
  if (token.type !== 'text' || token.tokens || token.escaped || token.cfmPlain) return false
  return linkifyText(token.text, contextBook)
}
