// Captures the release-note screenshots in public/release-notes/ from the running app: real pages, real
// clicks, a fresh signed-out browser for each shot (so no account or personal data), cropped to the feature
// and saved as WebP. See AGENTS.md ("Releases") for when to add or retake them.
//
//   npm run build && npx next start -p 3123          (a production build: no development overlay)
//   PLAYWRIGHT_CORE_DIR=/path/with/node_modules node scripts/capture-release-screenshots.mjs \
//     [--base http://localhost:3123] [--only 2.12.0-settings-header,2.9.0-jst]
//
// playwright-core isn't a project dependency: point PLAYWRIGHT_CORE_DIR at any directory where it's installed
// (npm install playwright-core in a scratch directory). CHROME_PATH defaults to /usr/bin/google-chrome.
// The script prints each file's size; copy it into src/lib/releaseNotes.ts, then run npm run release:check.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/release-notes");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const BASE = arg("--base", "http://localhost:3123");
const ONLY = arg("--only", "")?.split(",").filter(Boolean) ?? [];
/** Saved screenshots are at most this many pixels wide (twice an 800px crop). */
const MAX_WIDTH = 1600;
const QUALITY = 0.84;

const require = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? ROOT, "noop.js"));
const { chromium } = require("playwright-core");

async function open(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(800);
  // The reader's first-visit tip.
  const tip = page.getByRole("button", { name: "Got it" });
  if (await tip.isVisible().catch(() => false)) await tip.click();
}

/** Selects a verse's text the way a reader does: dragging across it. */
async function dragAcross(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 40, box.y + box.height - 12, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

/** Where a word sits on screen, measured with a Range, so a real double-click can select it. */
async function wordPoint(page, verse, word) {
  return verse.evaluate((root, target) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent.indexOf(target);
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, word);
}

/** The box of the smallest element holding all of these texts (a menu or panel around its contents). */
async function boxAround(page, texts) {
  return page.evaluate((wanted) => {
    const holds = (el) => wanted.every((text) => el.textContent.includes(text));
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const candidates = [...document.querySelectorAll("body *")].filter((el) => visible(el) && holds(el));
    const smallest = candidates.filter((el) => ![...el.children].some((child) => holds(child) && visible(child))).at(-1);
    const rect = smallest?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  }, texts);
}

function union(...boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

function pad(box, by, viewport) {
  const x = Math.max(0, box.x - by);
  const y = Math.max(0, box.y - by);
  return {
    x,
    y,
    width: Math.min(viewport.width - x, box.width + by * 2),
    height: Math.min(viewport.height - y, box.height + by * 2),
  };
}

/** Each shot opens its page, does what a reader would, and returns the area to keep. */
const SHOTS = [
  {
    name: "2.20.5-biblical-languages",
    viewport: { width: 1440, height: 1200 },
    async run(page, viewport) {
      await open(page, "/browse/oldtestament/genesis/1");
      const point = await wordPoint(page, page.locator(".reader-verse").first(), "God");
      await page.mouse.dblclick(point.x, point.y);
      await page.getByRole("button", { name: /^Explore/ }).first().click();
      const panel = page.locator("#word-study-panel-desktop");
      await panel.waitFor();
      const languages = panel.getByRole("button", { name: /Biblical languages/ });
      await languages.getByText(/matches/).waitFor();
      if (await languages.getAttribute("aria-expanded") !== "true") await languages.click();
      await panel.getByRole("heading", { name: "Hebrew", exact: true }).waitFor();
      await panel.getByRole("button", { name: /Show all .* Hebrew words/ }).click();
      await panel.getByRole("button", { name: "Show fewer Hebrew words", exact: true }).click();
      await panel.getByRole("button", { name: /Show all .* Greek words/ }).click();
      await panel.getByRole("button", { name: "Show fewer Greek words", exact: true }).click();
      await panel.getByRole("region", { name: "Sources for god", exact: true }).evaluate((element) => element.scrollTo(0, 0));
      return pad(await panel.boundingBox(), 8, viewport);
    },
  },
  {
    name: "2.20.3-testing-wordmark",
    viewport: { width: 1000, height: 1200 },
    async run(page, viewport) {
      await open(page, "/testing");
      const title = await page.getByRole("heading", { name: "Help test Verse Together", exact: true }).boundingBox();
      const form = page.locator("form");
      await form.waitFor();
      return pad(union(title, await form.boundingBox()), 16, viewport);
    },
  },
  {
    name: "2.20.1-testing-signup",
    viewport: { width: 1000, height: 1200 },
    async run(page, viewport) {
      await open(page, "/testing");
      const title = await page.getByRole("heading", { name: "Help test Verse Together", exact: true }).boundingBox();
      const form = page.locator("form");
      await form.waitFor();
      return pad(union(title, await form.boundingBox()), 16, viewport);
    },
  },
  {
    name: "2.20.0-passkey-sign-in",
    viewport: { width: 1000, height: 1000 },
    async run(page, viewport) {
      await open(page, "/sign-in");
      await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).waitFor();
      const title = await page.getByRole("heading", { name: "Sign in", exact: true }).boundingBox();
      const button = await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).boundingBox();
      const hint = await page.getByText("Already added a passkey?", { exact: false }).boundingBox();
      return pad(union(title, button, hint), 20, viewport);
    },
  },
  {
    name: "2.18.0-feature-guide",
    viewport: { width: 1280, height: 1100 },
    async run(page, viewport) {
      await open(page, "/feature-guide");
      const title = await page.getByRole("heading", { name: "Feature guide", exact: true }).boundingBox();
      const topics = page.getByRole("navigation", { name: "Topics", exact: true });
      const first = await topics.locator("li").first().boundingBox();
      const sixth = await topics.locator("li").nth(5).boundingBox();
      return pad(union(title, first, sixth), 12, viewport);
    },
  },
  {
    name: "2.17.0-tester-signup",
    viewport: { width: 1000, height: 1200 },
    async run(page, viewport) {
      await open(page, "/testing");
      const form = page.locator("form");
      await form.waitFor();
      return pad(await form.boundingBox(), 16, viewport);
    },
  },
  {
    name: "2.16.0-lesson-explore",
    viewport: { width: 1440, height: 1000 },
    async run(page, viewport) {
      await open(page, "/come-follow-me/2026-10-19");
      const title = page.getByRole("heading", { level: 1 }).first();
      await title.scrollIntoViewIfNeeded();
      const point = await wordPoint(page, title, "Knew");
      await page.mouse.dblclick(point.x, point.y);
      await page.getByRole("button", { name: /^Explore/ }).first().click();
      const panel = page.getByRole("complementary", { name: /^Explore / });
      await panel.waitFor();
      await page.waitForTimeout(6000);
      const scripture = page.locator('[aria-label="Scripture with expandable context"]');
      await scripture.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 100));
      await page.waitForTimeout(600);
      const column = await scripture.boundingBox();
      const sidebar = await panel.boundingBox();
      const gap = column.x - sidebar.x - sidebar.width;
      if (Math.abs(gap - 24) > 2) throw new Error(`Explore is ${gap}px from scripture; expected 24px`);
      return { x: sidebar.x - 8, y: 80, width: column.x + column.width - sidebar.x + 16, height: viewport.height - 96 };
    },
  },
  {
    name: "2.15.0-journal",
    viewport: { width: 1440, height: 900 },
    async run(page, viewport) {
      await open(page, "/browse/bookofmormon/1nephi/1");
      await page.getByRole("button", { name: "Log 1 Nephi 1", exact: true }).click();
      await page.getByRole("button", { name: "Add a note", exact: true }).waitFor();
      const panel = await page.getByRole("complementary", { name: "Journal", exact: true }).boundingBox();
      const verse = await page.locator(".reader-verse").first().boundingBox();
      return pad({ ...union(panel, verse), y: 72, height: 650 }, 8, viewport);
    },
  },
  {
    name: "2.15.0-next-chapter",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/browse/bookofmormon/1nephi/1");
      const nav = page.getByRole("navigation", { name: "Next chapter", exact: true });
      await nav.scrollIntoViewIfNeeded();
      return pad(union(await page.locator(".reader-verse").last().boundingBox(), await nav.boundingBox()), 20, viewport);
    },
  },
  {
    name: "2.15.0-lesson-explore",
    viewport: { width: 1440, height: 1000 },
    async run(page, viewport) {
      await open(page, "/come-follow-me/2026-10-19");
      const title = page.getByRole("heading", { level: 1 }).first();
      await title.scrollIntoViewIfNeeded();
      const point = await wordPoint(page, title, "Knew");
      await page.mouse.dblclick(point.x, point.y);
      await page.getByRole("button", { name: /^Explore/ }).first().click();
      const panel = page.getByRole("complementary", { name: /^Explore / });
      await panel.waitFor();
      await page.waitForTimeout(6000);
      return pad(union(await panel.boundingBox(), await title.boundingBox()), 8, viewport);
    },
  },
  {
    name: "2.13.0-translations",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/account#bible-translations");
      const panel = page.getByRole("tabpanel", { name: "Translations" });
      return pad(await panel.boundingBox(), 12, viewport);
    },
  },
  {
    name: "2.13.0-feedback",
    viewport: { width: 1280, height: 1000 },
    async run(page, viewport) {
      await open(page, "/account#feedback");
      const panel = page.getByRole("tabpanel", { name: "Feedback" });
      return pad(await panel.boundingBox(), 12, viewport);
    },
  },
  {
    name: "2.13.0-faith-tradition",
    viewport: { width: 1280, height: 1000 },
    async run(page, viewport) {
      await open(page, "/account#reading");
      const section = page.locator("section[aria-labelledby='faith-tradition-title']");
      await section.scrollIntoViewIfNeeded();
      return pad(await section.boundingBox(), 12, viewport);
    },
  },
  {
    name: "2.12.0-settings-header",
    viewport: { width: 1280, height: 920 },
    async run(page, viewport) {
      await open(page, "/account");
      await page.getByRole("tab", { name: "Reading" }).click();
      await page.waitForTimeout(400);
      // The header, the navigation at its left and the sections at its right, and the open Reading section
      // beneath them, from the header down.
      const navigation = await page.locator(".desktop-nav-bar").boundingBox();
      const tabs = await page.getByRole("tablist", { name: "Settings" }).boundingBox();
      const panel = await page.getByRole("tabpanel", { name: "Reading" }).boundingBox();
      const area = union(navigation, tabs, panel);
      return pad({ ...area, height: Math.min(area.y + area.height, viewport.height - 16) - area.y }, 12, viewport);
    },
  },
  {
    name: "2.12.0-reader-settings",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/browse/bookofmormon/1nephi/1");
      await page.getByRole("button", { name: "Reader settings" }).click();
      await page.waitForTimeout(500);
      const menu = await page.getByRole("switch", { name: "Simple mode" }).locator("xpath=ancestor::div[contains(@class,'absolute') or contains(@class,'fixed')][1]").boundingBox();
      const header = await page.getByRole("button", { name: "Reader settings" }).boundingBox();
      const area = union(menu, header);
      return pad(area, 12, viewport);
    },
  },
  {
    name: "2.10.0-translations",
    viewport: { width: 1280, height: 760 },
    async run(page, viewport) {
      await open(page, "/browse/newtestament/mark/9");
      await page.getByRole("button", { name: "Reader settings" }).click();
      await page.locator("[data-add-bible]").first().click();
      await page.getByPlaceholder("Search by name or abbreviation").waitFor();
      await page.waitForTimeout(1500);
      const dialog = page.getByRole("dialog", { name: "Add a Bible" });
      const header = await dialog.locator("header").boundingBox();
      const list = await dialog.getByRole("link", { name: /Browse all/ }).or(dialog.getByRole("button", { name: /Browse all/ })).boundingBox();
      const area = { x: 340, y: header.y, width: viewport.width - 680, height: list.y + list.height - header.y };
      return pad(area, 16, viewport);
    },
  },
  {
    name: "2.10.0-explore",
    viewport: { width: 1280, height: 900 },
    async run(page) {
      await open(page, "/browse/bookofmormon/1nephi/3");
      // Double-clicking a word selects it, and a single word offers Explore.
      const point = await wordPoint(page, page.locator(".reader-verse").nth(6), "commandments");
      await page.mouse.dblclick(point.x, point.y);
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: /^Explore/ }).first().click();
      await page.waitForTimeout(5000);
      // The panel's word and colored sections, beside the selected word in its verse.
      const panel = await boxAround(page, ["commandments", "Study helps", "Biblical languages"]);
      const verse = await page.locator(".reader-verse").nth(6).boundingBox();
      // From under the floating header, so the panel's "Explore word" heading shows, to the end of the verse.
      const top = 72;
      return { x: panel.x - 28, y: top, width: verse.x + verse.width + 16 - (panel.x - 28), height: verse.y + verse.height + 16 - top };
    },
  },
  {
    name: "2.10.0-quick-mark-colors",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/account#study-tools");
      // Give the first preset a custom color with its color input, as picking one in the system dialog would.
      await page.getByLabel(/custom color/).first().fill("#c2773a");
      await page.getByRole("heading", { name: "Quick marks" }).click();
      await page.waitForTimeout(500);
      const box = await page.getByRole("tabpanel", { name: "Study tools" }).locator("section").first().boundingBox();
      const fourth = await page.getByText("Pink highlight", { exact: true }).boundingBox();
      return pad({ x: box.x, y: box.y, width: box.width, height: fourth.y - 18 - box.y }, 8, viewport);
    },
  },
  {
    name: "2.9.0-jst",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/browse/newtestament/mark/9");
      await page.getByRole("button", { name: "Reader settings" }).click();
      await page.getByText("Joseph Smith Translation", { exact: true }).click();
      await page.getByRole("switch", { name: "Joseph Smith Translation (JST)" }).click();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1200);
      const first = page.locator(".reader-verse").nth(41);
      await first.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
      await page.waitForTimeout(600);
      const top = await first.boundingBox();
      const last = await page.locator(".reader-verse").nth(44).boundingBox();
      return pad({ ...union(top, last), x: top.x - 8, width: 920 }, 12, viewport);
    },
  },
  {
    name: "2.8.0-lesson-artwork",
    viewport: { width: 1280, height: 860 },
    async run(page, viewport) {
      await open(page, "/come-follow-me/2026-10-19");
      return { x: 0, y: 0, width: viewport.width, height: viewport.height };
    },
  },
  {
    name: "2.6.0-scripture-first",
    viewport: { width: 1280, height: 900 },
    async run(page, viewport) {
      await open(page, "/come-follow-me/2026-10-19");
      const invitation = page.getByText("Read the scriptures. Open the context as you go.");
      await invitation.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 96));
      await page.waitForTimeout(600);
      const context = page.locator("details[data-context] > summary").first();
      await context.click();
      await page.waitForTimeout(500);
      const start = await invitation.boundingBox();
      return pad({ x: start.x - 24, y: start.y, width: 780, height: viewport.height - start.y - 24 }, 12, viewport);
    },
  },
  {
    name: "2.5.0-quick-marks",
    viewport: { width: 1280, height: 860 },
    async run(page, viewport) {
      await open(page, "/browse/bookofmormon/1nephi/3");
      const verse = page.locator(".reader-verse").nth(6);
      await dragAcross(page, verse);
      const menu = await boxAround(page, ["New Note", "Copy text", "1 Nephi 3:7"]);
      return pad(union(menu, await verse.boundingBox()), 16, viewport);
    },
  },
  {
    name: "2.4.0-journal-home",
    viewport: { width: 1280, height: 860 },
    async run(page, viewport) {
      await open(page, "/notes");
      const month = await page.getByRole("heading", { name: "This month" }).boundingBox();
      return { x: 16, y: 72, width: viewport.width - 32, height: month.y - 20 - 72 };
    },
  },
  {
    name: "2.2.0-book-artwork",
    viewport: { width: 1280, height: 860 },
    async run(page, viewport) {
      await open(page, "/browse/bookofmormon");
      const first = await page.getByRole("link", { name: /1 Nephi/ }).first().boundingBox();
      const last = await page.getByRole("link", { name: /Helaman/ }).first().boundingBox();
      return pad(union(first, last, { x: viewport.width - first.x, y: first.y, width: 0, height: 0 }), 12, viewport);
    },
  },
  {
    name: "2.1.0-browse",
    viewport: { width: 1280, height: 860 },
    async run(page, viewport) {
      await open(page, "/browse");
      const last = await page.getByRole("link", { name: /Pearl of Great Price/ }).first().boundingBox();
      return { x: 32, y: 0, width: viewport.width - 64, height: last.y + last.height + 16 };
    },
  },
];

/** PNG bytes to WebP, scaled to MAX_WIDTH, using the browser's own encoder. */
async function toWebp(converter, png) {
  const dataUrl = await converter.evaluate(
    async ({ src, maxWidth, quality }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/webp", quality);
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, maxWidth: MAX_WIDTH, quality: QUALITY }
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const converter = await (await browser.newContext()).newPage();
mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const shot of SHOTS.filter((item) => !ONLY.length || ONLY.includes(item.name))) {
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    const clip = await shot.run(page, shot.viewport);
    if (!shot.keepPointer) await page.mouse.move(shot.viewport.width - 2, shot.viewport.height - 2);
    const png = await page.screenshot({ clip, caret: "hide", animations: "disabled" });
    const webp = await toWebp(converter, png);
    const file = path.join(OUT, `${shot.name}.webp`);
    writeFileSync(file, webp);
    const size = await converter.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${image.naturalWidth}×${image.naturalHeight}`;
    }, `data:image/webp;base64,${webp.toString("base64")}`);
    console.log(`${shot.name}.webp  ${size}  ${Math.round(webp.length / 1024)} KB`);
  } catch (error) {
    failed += 1;
    console.error(`${shot.name}: ${error.message.split("\n")[0]}`);
    await page.screenshot({ path: path.join("/tmp", `release-shot-${shot.name}-failed.png`) }).catch(() => {});
  } finally {
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
