import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'content/cfm')
const manifest = path.join(directory, 'guides.json')
export function validateMarkdown(markdown) {
  if (/chatgpt\.com|page_[a-f0-9]{20,}|\/Users\/|session_id|response_uuid/i.test(markdown)) throw new Error('Private context or process metadata in guide')
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type === 'html' || token.type === 'image') throw new Error('Raw HTML and images are not accepted in CFM Markdown')
    if (token.type === 'link') {
      const url = new URL(token.href)
      if (!['https:', 'http:'].includes(url.protocol) || /^(localhost|127\.|10\.|192\.168\.)/i.test(url.hostname) || url.username || url.password) throw new Error('Only public HTTP citations are accepted')
    }
  })
  if (!/^# .+/m.test(markdown) || !/^## /m.test(markdown)) throw new Error('Guide needs a title and sections')
}
function validateMetadata(guide) {
  for (const field of ['slug', 'title', 'scripture', 'startDate', 'endDate', 'dateLabel', 'author', 'summary']) {
    if (typeof guide[field] !== 'string' || !guide[field].trim()) throw new Error(`Missing ${field}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug)) throw new Error('Use a dated lowercase slug')
  for (const field of ['startDate', 'endDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(guide[field]) || Number.isNaN(Date.parse(guide[field]))) throw new Error(`Invalid ${field}`)
  if (guide.startDate > guide.endDate || !guide.slug.startsWith(guide.startDate)) throw new Error('Dates do not match slug or lesson range')
  if (Object.keys(guide).some(key => !['slug', 'title', 'scripture', 'startDate', 'endDate', 'dateLabel', 'author', 'summary', 'sha256'].includes(key))) throw new Error('Unexpected metadata field')
}
const [command, source, metadataPath] = process.argv.slice(2)
const guides = JSON.parse(fs.readFileSync(manifest, 'utf8'))
if (command === 'import') {
  if (!source || !metadataPath) throw new Error('Usage: node scripts/cfm-content.mjs import guide.md metadata.json')
  const markdown = fs.readFileSync(source, 'utf8')
  const guide = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  validateMetadata(guide)
  validateMarkdown(markdown)
  guide.sha256 = createHash('sha256').update(markdown).digest('hex')
  if (guides.some(g => g.slug === guide.slug)) throw new Error('Guide already exists; review an explicit correction instead of overwriting it')
  fs.writeFileSync(path.join(directory, `${guide.slug}.md`), markdown)
  guides.push(guide)
  guides.sort((a, b) => b.startDate.localeCompare(a.startDate))
  fs.writeFileSync(manifest, JSON.stringify(guides, null, 2) + '\n')
  console.log(`Imported ${guide.slug}; SHA-256 ${guide.sha256}`)
} else if (command !== 'check') throw new Error('Expected import or check')
for (const guide of guides) {
  validateMetadata(guide)
  const markdown = fs.readFileSync(path.join(directory, `${guide.slug}.md`), 'utf8')
  validateMarkdown(markdown)
  if (createHash('sha256').update(markdown).digest('hex') !== guide.sha256) throw new Error(`Hash mismatch: ${guide.slug}`)
  console.log(`Verified ${guide.slug}: ${markdown.trim().split(/\s+/).length} words`)
}
if (new Set(guides.map(g => g.slug)).size !== guides.length) throw new Error('Duplicate guide slug')
