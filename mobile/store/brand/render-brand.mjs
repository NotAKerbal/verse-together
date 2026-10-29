#!/usr/bin/env node
// Renders the app's launcher, splash and store artwork from one vector source: the Verse Together mark
// (bookmark, open book, rubric dot) traced from public/brand/icons/{light,dark}/icon.png at their 512 px
// size. It writes the SVG sources to store/brand/svg/ and renders them with sharp (libvips + librsvg),
// using only the font files listed in FONTS, so the same inputs give the same pixels.
//
//   node store/brand/render-brand.mjs           # write store/brand/svg, assets/brand and store/assets
//   node store/brand/render-brand.mjs --check   # exit 1 if any written file differs from a fresh render
//
// sharp comes from the repository root's node_modules (run the root's `npm ci` first).

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(mobileRoot, "..");
const check = process.argv.includes("--check");

const FONTS = [
  path.join(mobileRoot, "node_modules/@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf"),
  path.join(mobileRoot, "node_modules/@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf"),
  // Android's system serif, which the app's titles and scripture use there (fonts-noto-core).
  "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
];

// fontconfig is read when sharp loads, so point it at a private config holding only FONTS.
const fontDir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-brand-fonts-"));
for (const font of FONTS) {
  if (!fs.existsSync(font)) throw new Error(`Missing font ${font}`);
  fs.symlinkSync(font, path.join(fontDir, path.basename(font)));
}
fs.writeFileSync(
  path.join(fontDir, "fonts.conf"),
  `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${fontDir}</dir><cachedir>${fontDir}/cache</cachedir></fontconfig>\n`,
);
process.env.FONTCONFIG_FILE = path.join(fontDir, "fonts.conf");
const sharp = createRequire(path.join(repoRoot, "package.json"))("sharp");

// Colors sampled (region averages) from the existing icons, and the site's theme (src/app/globals.css).
const ICON = {
  light: { paper: "#f8f4ed", mark: "#211d19", dot: "#ad482e" },
  dark: { paper: "#181513", mark: "#eae4d8", dot: "#e58a70" },
};
const SITE = { background: "#f6f3ec", backgroundDark: "#181715", ink: "#1f1d1a", rubric: "#9a3020", rule: "#e0d9cb" };

// The mark, in the 512 x 512 space of the source icons. Its box is x 148.5–362.5, y 104–408 (center 255.5, 256).
const MARK_BOX = { x: 148.5, y: 104, width: 214, height: 304, cx: 255.5, cy: 256 };
const BOOKMARK =
  "M148.5,132 A28,28 0 0 1 176.5,104 H334.5 A28,28 0 0 1 362.5,132 V392 Q362.5,408 348.4,400.4 " +
  "L264.3,355 Q255.5,350.3 246.7,355 L162.6,400.4 Q148.5,408 148.5,392 Z";
const PAGES =
  "M172,159 C215,159 240,172 251.5,202 V290 C240,268 212,259 172,259 Z " +
  "M339,159 C296,159 271,172 259.5,202 V290 C271,268 299,259 339,259 Z";
const DOT = { cx: 255.5, cy: 159, r: 18.5 };

/** The mark with its pages open to whatever is behind it, scaled to `height` and centered on (cx, cy). */
function mark({ cx, cy, height, colors, pages = null, id = "m" }) {
  const s = height / MARK_BOX.height;
  const t = `translate(${r(cx - MARK_BOX.cx * s)} ${r(cy - MARK_BOX.cy * s)}) scale(${r(s)})`;
  return `<g transform="${t}">
    <mask id="${id}-pages" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><path d="${PAGES}" fill="#000"/>
    </mask>
    <path d="${BOOKMARK}" fill="${colors.mark}" mask="url(#${id}-pages)"/>${
      pages ? `\n    <path d="${PAGES}" fill="${pages}"/>` : ""
    }
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${colors.dot}"/>
  </g>`;
}

/** One-color silhouette for Android themed icons: the dot keeps a clear gap so it reads apart from the bookmark. */
function monochromeMark({ cx, cy, height }) {
  const s = height / MARK_BOX.height;
  const t = `translate(${r(cx - MARK_BOX.cx * s)} ${r(cy - MARK_BOX.cy * s)}) scale(${r(s)})`;
  return `<g transform="${t}">
    <mask id="mono-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><path d="${PAGES}" fill="#000"/>
      <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r + 5}" fill="#000"/>
    </mask>
    <path d="${BOOKMARK}" fill="#000" mask="url(#mono-cut)"/>
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#000"/>
  </g>`;
}

const r = (n) => Math.round(n * 10000) / 10000;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  ${body}\n</svg>\n`;

// Adaptive icons: a 108 dp canvas, of which launchers show the middle 72 dp through their mask, and only a
// circle of 66 dp is guaranteed. The mark is 52 dp tall, so even its bottom corners stay inside that circle.
const A = 1024;
const dp = A / 108;
const ADAPTIVE_MARK_HEIGHT = 52 * dp;
// Splash: Expo centers the image (imageWidth dp) on a 288 dp canvas; Android 12+ shows a 192 dp circle of it.
const SPLASH_IMAGE_WIDTH_DP = 112;

const sources = {
  "adaptive-foreground": svg(A, A, mark({ cx: A / 2, cy: A / 2, height: ADAPTIVE_MARK_HEIGHT, colors: ICON.light, id: "fg" })),
  "adaptive-monochrome": svg(A, A, monochromeMark({ cx: A / 2, cy: A / 2, height: ADAPTIVE_MARK_HEIGHT })),
  "splash-light": svg(A, A, mark({ cx: A / 2, cy: A / 2, height: A * 0.92, colors: ICON.light, id: "sl" })),
  "splash-dark": svg(A, A, mark({ cx: A / 2, cy: A / 2, height: A * 0.92, colors: ICON.dark, id: "sd" })),
  "feature-graphic": svg(1024, 500, featureGraphic()),
};

function featureGraphic() {
  const left = 404;
  return `<rect width="1024" height="500" fill="${SITE.background}"/>
  <rect x="40" y="40" width="944" height="420" fill="none" stroke="${SITE.rule}" stroke-width="1.5"/>
  <line x1="${left - 52}" y1="104" x2="${left - 52}" y2="396" stroke="${SITE.rule}" stroke-width="1.5"/>
  ${mark({ cx: 196, cy: 250, height: 262, colors: { mark: SITE.ink, dot: ICON.light.dot }, pages: SITE.background, id: "fgx" })}
  <text x="${left}" y="168" font-family="DM Sans" font-weight="600" font-size="17" letter-spacing="3.4" fill="${SITE.rubric}">SCRIPTURE STUDY</text>
  <text x="${left - 3}" y="252" font-family="Noto Serif" font-size="72" fill="${SITE.ink}">Verse Together</text>
  <rect x="${left}" y="282" width="56" height="2.5" fill="${SITE.rubric}"/>
  <text font-family="DM Sans" font-size="25" fill="#4f4b45">
    <tspan x="${left}" y="334">The standard works, offline. Mark exact</tspan>
    <tspan x="${left}" y="370">words and keep a journal on your device.</tspan>
  </text>`;
}

// Raster outputs: [file, source, width, height, options].
const outputs = [
  ["assets/brand/adaptive-foreground.png", "adaptive-foreground", A, A],
  ["assets/brand/adaptive-monochrome.png", "adaptive-monochrome", A, A],
  ["assets/brand/splash-light.png", "splash-light", A, A],
  ["assets/brand/splash-dark.png", "splash-dark", A, A],
  ["store/assets/feature-graphic-1024x500.png", "feature-graphic", 1024, 500, { opaque: true }],
];

async function render(source, width, height, { opaque = false } = {}) {
  let img = sharp(Buffer.from(sources[source]), { density: 72 }).resize(width, height);
  if (opaque) img = img.flatten({ background: SITE.background }).removeAlpha();
  return img.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

/** The Play store icon is the site's existing light icon, pixel for pixel, with the opaque alpha channel Play asks for. */
async function storeIcon() {
  const src = path.join(repoRoot, "public/brand/icons/light/icon.png");
  return sharp(src).ensureAlpha(1).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

/** A review sheet: the adaptive icon through common launcher masks, the safe zone, and a themed (monochrome) icon. */
async function reviewSheet() {
  const cell = 300;
  const view = (cell * 108) / 72; // the 108 dp layers scaled so the 72 dp viewport fills a cell
  const fg = await sharp(Buffer.from(sources["adaptive-foreground"])).resize(Math.round(view)).png().toBuffer();
  const mono = await sharp(Buffer.from(sources["adaptive-monochrome"])).resize(Math.round(view)).png().toBuffer();
  const fgData = fg.toString("base64");
  // Launchers use only the monochrome layer's alpha, tinted with the wallpaper's colors.
  const monoAlpha = await sharp(mono).extractChannel(3).png().toBuffer();
  const tinted = async (tint) =>
    (await sharp({ create: { width: Math.round(view), height: Math.round(view), channels: 3, background: tint } })
      .joinChannel(monoAlpha).png().toBuffer()).toString("base64");
  const off = -(view - cell) / 2;
  const squircle = (() => {
    const pts = [];
    for (let i = 0; i < 360; i++) {
      const a = (i * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      pts.push(`${r(cell / 2 + (cell / 2) * Math.sign(c) * Math.abs(c) ** 0.5)},${r(cell / 2 + (cell / 2) * Math.sign(s) * Math.abs(s) ** 0.5)}`);
    }
    return `<polygon points="${pts.join(" ")}"/>`;
  })();
  const shapes = {
    circle: `<circle cx="${cell / 2}" cy="${cell / 2}" r="${cell / 2}"/>`,
    squircle,
    "rounded square": `<rect width="${cell}" height="${cell}" rx="${cell * 0.22}"/>`,
    square: `<rect width="${cell}" height="${cell}"/>`,
  };
  const pad = 40, gap = 40, label = 44;
  const cols = Object.keys(shapes).length;
  const W = pad * 2 + cols * cell + (cols - 1) * gap;
  const H = pad * 2 + 3 * (cell + label + 34) + 2 * gap + 50;
  let body = `<rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${pad}" y="${pad + 8}" font-family="DM Sans" font-weight="600" font-size="22" fill="#1f1d1a">Adaptive icon review: launcher masks (72 dp viewport), safe zone, themed icon</text>`;
  const rows = [
    { name: "full color (foreground on #f8f4ed background)", fill: ICON.light.paper, img: fgData },
    { name: "themed icon (monochrome layer), example light wallpaper tint", fill: "#dfe6d5", img: await tinted("#33422c") },
    { name: "themed icon (monochrome layer), example dark wallpaper tint", fill: "#2b3326", img: await tinted("#cfe0c2") },
  ];
  rows.forEach((row, ri) => {
    const y0 = pad + 50 + 34 + ri * (cell + label + 34 + gap);
    body += `\n  <text x="${pad}" y="${y0 - 14}" font-family="DM Sans" font-weight="600" font-size="19" fill="#1f1d1a">${row.name}</text>`;
    Object.entries(shapes).forEach(([name, shape], ci) => {
      const x0 = pad + ci * (cell + gap);
      const id = `c${ri}-${ci}`;
      const image = `<image href="data:image/png;base64,${row.img}" x="${off}" y="${off}" width="${view}" height="${view}"/>`;
      body += `
  <clipPath id="${id}">${shape}</clipPath>
  <g transform="translate(${x0} ${y0})"><g clip-path="url(#${id})"><rect width="${cell}" height="${cell}" fill="${row.fill}"/>${image}</g>
    ${ri === 0 && ci === 3 ? `<circle cx="${cell / 2}" cy="${cell / 2}" r="${(cell * 33) / 72}" fill="none" stroke="#d0342c" stroke-width="2" stroke-dasharray="8 6"/>` : ""}
  </g>
  <text x="${x0}" y="${y0 + cell + 28}" font-family="DM Sans" font-size="18" fill="#46423b">${name}${ri === 0 && ci === 3 ? " + 66 dp safe circle" : ""}</text>`;
    });
  });
  return sharp(Buffer.from(svg(W, H, body))).png({ compressionLevel: 9 }).toBuffer();
}

/** Android 12+ splash preview: the 288 dp canvas Expo writes, cut to the 192 dp circle Android shows, light and dark. */
async function splashSheet() {
  const scale = 1.25; // px per dp in the sheet
  const canvas = 288 * scale, size = SPLASH_IMAGE_WIDTH_DP * scale;
  const pad = 40;
  let body = `<rect width="${pad * 3 + canvas * 2}" height="${pad * 2 + canvas + 24}" fill="#ffffff"/>
  <text x="${pad}" y="${pad}" font-family="DM Sans" font-weight="600" font-size="16" fill="#1f1d1a">Splash, Android 12+: ${SPLASH_IMAGE_WIDTH_DP} dp image on the 288 dp canvas; dashed: the 192 dp circle shown</text>`;
  for (const [i, theme] of ["light", "dark"].entries()) {
    const png = await sharp(Buffer.from(sources[`splash-${theme}`])).resize(Math.round(size)).png().toBuffer();
    const x0 = pad + i * (canvas + pad), y0 = pad + 24;
    const bg = theme === "light" ? SITE.background : SITE.backgroundDark;
    body += `
  <g transform="translate(${x0} ${y0})"><rect width="${canvas}" height="${canvas}" fill="${bg}"/>
    <image href="data:image/png;base64,${png.toString("base64")}" x="${(canvas - size) / 2}" y="${(canvas - size) / 2}" width="${size}" height="${size}"/>
    <circle cx="${canvas / 2}" cy="${canvas / 2}" r="${96 * scale}" fill="none" stroke="#d0342c" stroke-width="2" stroke-dasharray="8 6"/></g>`;
  }
  return sharp(Buffer.from(svg(pad * 3 + canvas * 2, pad * 2 + canvas + 24, body))).png({ compressionLevel: 9 }).toBuffer();
}

const files = new Map();
for (const [name, text] of Object.entries(sources)) files.set(`store/brand/svg/${name}.svg`, Buffer.from(text));
for (const [file, source, w, h, opts] of outputs) files.set(file, await render(source, w, h, opts));
files.set("store/assets/play-icon-512.png", await storeIcon());
files.set("store/brand/review/adaptive-icon-masks.png", await reviewSheet());
files.set("store/brand/review/splash-android12.png", await splashSheet());

let stale = 0;
const manifest = { generatedBy: "store/brand/render-brand.mjs", sharp: sharp.versions.sharp, librsvg: sharp.versions.rsvg, fonts: {}, files: {} };
for (const font of FONTS) manifest.fonts[path.relative(repoRoot, font).startsWith("..") ? font : path.relative(repoRoot, font)] = sha256(fs.readFileSync(font));
for (const [file, data] of files) {
  manifest.files[file] = sha256(data);
  const target = path.join(mobileRoot, file);
  if (check) {
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(data)) {
      console.error(`stale: ${file}`);
      stale++;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestPath = path.join(here, "manifest.json");
if (check) {
  if (!fs.existsSync(manifestPath) || fs.readFileSync(manifestPath, "utf8") !== manifestText) {
    console.error("stale: store/brand/manifest.json");
    stale++;
  }
} else fs.writeFileSync(manifestPath, manifestText);
fs.rmSync(fontDir, { recursive: true, force: true });
if (check && stale) process.exit(1);
console.log(check ? "Brand assets are current." : `Wrote ${files.size + 1} files.`);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export { SPLASH_IMAGE_WIDTH_DP };
