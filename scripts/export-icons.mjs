// Deterministic icon export: one square light PNG + one square dark PNG -> favicon/app-icon family.
// Writes only into an explicit, empty output directory; never into src/, public/ or other product paths.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MIN_SOURCE_SIZE = 512
const KERNEL = 'lanczos3'
// Maskable icons: only a centred circle of radius 40% of the icon's width is guaranteed to survive any mask.
const SAFE_RADIUS = 0.4
const PNG_OPTIONS = { compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false }
const PROTECTED_DIRS = ['src', 'public', '.next', 'node_modules', '.git', 'scripts', 'content', 'convex']
const USAGE = `Usage:
  node scripts/export-icons.mjs --light <light.png> --dark <dark.png> --out <empty-or-new-dir> [--light-bg #rrggbb] [--dark-bg #rrggbb]
  npm run icons:export -- --light <light.png> --dark <dark.png> --out <dir>

Inputs must be existing, square, single-frame PNG files of at least ${MIN_SOURCE_SIZE}x${MIN_SOURCE_SIZE} (no upscaling).
--out must not exist yet or be empty, and may not be the repository root or inside ${PROTECTED_DIRS.join(', ')}.
--light-bg / --dark-bg override the maskable/Apple background; by default it is the dominant opaque
colour of the source's 1px edge ring, and the export fails if that edge is not a clear opaque colour.

Outputs (per variant light/ and dark/):
  favicon-16.png favicon-32.png favicon-48.png   uniform resize, alpha kept
  icon-192.png icon-512.png                      uniform resize, alpha kept
  apple-icon-180.png                             uniform resize, flattened on the background (opaque)
  maskable-192.png maskable-512.png              the whole square artwork centred inside the maskable safe zone, a circle of
                                                 radius ${Math.round(SAFE_RADIUS * 100)}% of the icon (so even its corners survive any mask): at most
                                                 ${Math.floor(SAFE_RADIUS * Math.SQRT2 * 1000) / 10}% of the icon wide, on the background (opaque)
Plus light/favicon.ico (PNG-container, 16/32/48), next-app/{icon.png,apple-icon.png,favicon.ico}
(light copies staged for a reviewed copy into src/app) and icon-manifest.json.`

function fail(message) {
  console.error(`export-icons: ${message}\n\n${USAGE}`)
  process.exit(2)
}

function isInside(child, parent) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')
const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

function parseHex(value, flag) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value)
  if (!match) fail(`${flag} must be a #rrggbb colour`)
  const n = parseInt(match[1], 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

let args
try {
  args = parseArgs({
    options: {
      light: { type: 'string' },
      dark: { type: 'string' },
      out: { type: 'string' },
      'light-bg': { type: 'string' },
      'dark-bg': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  }).values
} catch (error) {
  fail(error.message)
}
if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

// Everything that can be checked without decoding pixels is checked before sharp is loaded or anything is written.
for (const flag of ['light', 'dark', 'out']) if (!args[flag]) fail(`--${flag} is required`)
const inputs = {}
for (const variant of ['light', 'dark']) {
  const file = path.resolve(args[variant])
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`--${variant} source does not exist: ${file}`)
  const bytes = fs.readFileSync(file)
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`--${variant} source is not a PNG file: ${file}`)
  inputs[variant] = { file, bytes, sha256: sha256(bytes) }
}
if (inputs.light.sha256 === inputs.dark.sha256) fail('--light and --dark are the same image; supply the matching dark artwork')
const out = path.resolve(args.out)
if (out === root || PROTECTED_DIRS.some(dir => isInside(out, path.join(root, dir)))) fail(`--out may not be the repository root or a product/source directory: ${out}`)
if (fs.existsSync(out) && (!fs.statSync(out).isDirectory() || fs.readdirSync(out).length)) fail(`--out must be a new or empty directory: ${out}`)

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  fail('sharp is not installed (it normally ships with next); run npm install first')
}

async function inspectSource(variant) {
  const { file, bytes } = inputs[variant]
  const meta = await sharp(bytes).metadata()
  if (meta.format !== 'png') fail(`--${variant} did not decode as PNG: ${file}`)
  if ((meta.pages ?? 1) > 1) fail(`--${variant} is an animated/multi-frame PNG: ${file}`)
  if (meta.width !== meta.height) fail(`--${variant} must be square, got ${meta.width}x${meta.height}`)
  if (meta.width < MIN_SOURCE_SIZE) fail(`--${variant} must be at least ${MIN_SOURCE_SIZE}px, got ${meta.width}px`)

  let background
  let backgroundSource = 'flag'
  if (args[`${variant}-bg`]) background = parseHex(args[`${variant}-bg`], `--${variant}-bg`)
  else {
    // Dominant colour of the outer 1px ring; it must be fully opaque and cover most of the edge.
    const { data, info } = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
    if (info.channels !== 4 || data.length !== info.width * info.height * 4) fail(`--${variant} could not be read as 8-bit RGBA`)
    const counts = new Map()
    let total = 0
    for (let y = 0; y < info.height; y++) {
      const edgeRow = y === 0 || y === info.height - 1
      for (let x = 0; x < info.width; x += edgeRow || x === info.width - 1 ? 1 : info.width - 1) {
        const key = data.readUInt32BE((y * info.width + x) * 4)
        counts.set(key, (counts.get(key) ?? 0) + 1)
        total++
      }
    }
    const [key, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    if ((key & 255) !== 255 || count / total < 0.5) {
      fail(`--${variant} edge is not a single opaque colour (most common edge colour covers ${Math.round((count / total) * 100)}%); pass --${variant}-bg #rrggbb explicitly`)
    }
    background = { r: key >>> 24, g: (key >>> 16) & 255, b: (key >>> 8) & 255 }
    backgroundSource = 'edge'
  }
  return { ...inputs[variant], width: meta.width, height: meta.height, hasAlpha: Boolean(meta.hasAlpha), background, backgroundSource }
}

// Sources are verified square, so this is a uniform downscale; srgb also pins 16-bit sources to 8-bit output.
const resized = (source, size) =>
  sharp(source.bytes).resize(size, size, { fit: 'contain', kernel: KERNEL, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toColourspace('srgb')

async function standardPng(source, size) {
  return resized(source, size).ensureAlpha().png(PNG_OPTIONS).toBuffer()
}

async function applePng(source, size) {
  return resized(source, size).flatten({ background: source.background }).removeAlpha().png(PNG_OPTIONS).toBuffer()
}

// The artwork square for a maskable icon of `size`. Its corners, the points farthest from the centre, must lie
// inside the safe circle: half its diagonal, side / sqrt(2), may not exceed SAFE_RADIUS * size, so the side is
// at most sqrt(2) * SAFE_RADIUS * size. Even, whole-pixel padding keeps it exactly centred, and rounding the
// padding up only ever shrinks the square (its aspect ratio stays 1:1).
function maskableLayout(size) {
  let padding = Math.ceil((size - SAFE_RADIUS * Math.SQRT2 * size) / 2)
  const cornerFits = () => (size / 2 - padding) * Math.SQRT2 <= SAFE_RADIUS * size
  while (!cornerFits()) padding++
  const art = size - padding * 2
  if (art < 1 || !cornerFits()) throw new Error(`Self-check failed for the maskable layout at ${size}px`)
  const px = value => Number(value.toFixed(3))
  return { padding, art, cornerRadius: px((art / 2) * Math.SQRT2), safeRadius: px(SAFE_RADIUS * size) }
}

async function maskablePng(source, size) {
  const { padding, art: side } = maskableLayout(size)
  const art = await resized(source, side).ensureAlpha().png(PNG_OPTIONS).toBuffer()
  const composed = await sharp({ create: { width: size, height: size, channels: 4, background: { ...source.background, alpha: 1 } } })
    .composite([{ input: art, left: padding, top: padding }])
    .png(PNG_OPTIONS)
    .toBuffer()
  return sharp(composed).removeAlpha().png(PNG_OPTIONS).toBuffer()
}

function pngIco(images) {
  // ICONDIR + ICONDIRENTRY[] followed by the PNG payloads (supported by all current browsers and Windows Vista+).
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(buffer.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += buffer.length
  })
  return Buffer.concat([header, ...images.map(image => image.buffer)])
}

const OUTPUTS = [
  { name: 'favicon-16.png', size: 16, purpose: 'favicon', render: standardPng },
  { name: 'favicon-32.png', size: 32, purpose: 'favicon', render: standardPng },
  { name: 'favicon-48.png', size: 48, purpose: 'favicon', render: standardPng },
  { name: 'icon-192.png', size: 192, purpose: 'any', render: standardPng },
  { name: 'icon-512.png', size: 512, purpose: 'any', render: standardPng },
  { name: 'apple-icon-180.png', size: 180, purpose: 'apple-touch-icon', render: applePng },
  { name: 'maskable-192.png', size: 192, purpose: 'maskable', render: maskablePng },
  { name: 'maskable-512.png', size: 512, purpose: 'maskable', render: maskablePng },
]

const sources = { light: await inspectSource('light'), dark: await inspectSource('dark') }
const files = []
const byPath = new Map()
function add(relativePath, variant, purpose, buffer, sizes) {
  files.push({ path: relativePath, variant, purpose, sizes, bytes: buffer.length, sha256: sha256(buffer) })
  byPath.set(relativePath, buffer)
}

for (const variant of ['light', 'dark']) {
  for (const output of OUTPUTS) {
    const buffer = await output.render(sources[variant], output.size)
    const meta = await sharp(buffer).metadata()
    const opaque = output.purpose === 'apple-touch-icon' || output.purpose === 'maskable'
    if (meta.format !== 'png' || meta.width !== output.size || meta.height !== output.size || meta.hasAlpha === opaque) {
      throw new Error(`Self-check failed for ${variant}/${output.name}: ${meta.format} ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`)
    }
    add(`${variant}/${output.name}`, variant, output.purpose, buffer, [output.size])
  }
}
const ico = pngIco([16, 32, 48].map(size => ({ size, buffer: byPath.get(`light/favicon-${size}.png`) })))
if (ico.readUInt16LE(4) !== 3) throw new Error('Self-check failed for favicon.ico')
add('light/favicon.ico', 'light', 'favicon', ico, [16, 32, 48])
add('next-app/icon.png', 'light', 'next-app-copy', byPath.get('light/icon-512.png'), [512])
add('next-app/apple-icon.png', 'light', 'next-app-copy', byPath.get('light/apple-icon-180.png'), [180])
add('next-app/favicon.ico', 'light', 'next-app-copy', ico, [16, 32, 48])

const manifest = {
  generator: 'scripts/export-icons.mjs',
  sharp: sharp.versions.sharp,
  libvips: sharp.versions.vips,
  kernel: KERNEL,
  maskable: {
    safeZone: { shape: 'circle', radius: SAFE_RADIUS, of: 'icon width' },
    fit: 'whole source square inside the safe circle, centred',
    layouts: Object.fromEntries(OUTPUTS.filter(o => o.purpose === 'maskable').map(o => [o.size, maskableLayout(o.size)])),
  },
  sources: Object.fromEntries(
    Object.entries(sources).map(([variant, s]) => [
      variant,
      { file: path.basename(s.file), sha256: s.sha256, width: s.width, height: s.height, hasAlpha: s.hasAlpha, background: hex(s.background), backgroundSource: s.backgroundSource },
    ]),
  ),
  files,
}

// All renders succeeded in memory; only now touch the filesystem, and never overwrite.
for (const dir of ['light', 'dark', 'next-app']) fs.mkdirSync(path.join(out, dir), { recursive: true })
for (const [relativePath, buffer] of byPath) fs.writeFileSync(path.join(out, relativePath), buffer, { flag: 'wx' })
fs.writeFileSync(path.join(out, 'icon-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })

for (const file of files) console.log(`${file.path.padEnd(28)} ${file.sizes.join('/').padEnd(9)} ${String(file.bytes).padStart(7)} B  ${file.sha256.slice(0, 12)}`)
for (const [size, layout] of Object.entries(manifest.maskable.layouts)) {
  console.log(`maskable ${size}: ${layout.art}px artwork, ${layout.padding}px padding; corners ${layout.cornerRadius}px from centre, inside the ${layout.safeRadius}px safe circle`)
}
console.log(`Wrote ${files.length} files and icon-manifest.json to ${out}`)
