// Capture helpers for the feature guide's demo clips (derived from the narrated tutorial's capture helpers).
// Every interaction is real input (mouse, wheel, keyboard) dispatched to a production build of the app.
// DOM reads are used only to find where things are and to assert results, never to change app state.
// Playwright is not an app dependency: point VT_PLAYWRIGHT at an installed copy's index.mjs (see README.md).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.VT_PLAYWRIGHT ? pathToFileURL(process.env.VT_PLAYWRIGHT).href : 'playwright');

export const B = process.env.VT_BASE_URL || 'http://127.0.0.1:3245';
// 1280x720 CSS px at device scale 1.5 gives native 1920x1080 frames with text about 25% larger than v1.
export const VW = 1280, VH = 720, DPR = 1.5;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(profile) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, colorScheme: 'light',
    reducedMotion: 'no-preference', permissions: ['clipboard-read', 'clipboard-write'],
    // Emulated DPR alone yields CSS-sized (1280x720) screencast frames; the flag makes the compositor render at 1.5x.
    args: [`--force-device-scale-factor=${DPR}`],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page };
}

// CDP screencast: every frame the compositor produces, with its timestamp. Marks carry geometry for the editor.
export async function startCast(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${dir}/${f}`, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const marks = [];
  return {
    // boxes are CSS px [x, y, w, h]; the editor scales them by DPR to frame pixels.
    mark: (label, boxes = {}) => { marks.push({ label, t: Date.now() / 1000, boxes }); },
    // pointer: every real mouse event the Actor dispatched ({t, x, y, down}), CSS px. The editor draws the
    // viewer-facing pointer from it at the output frame rate (headless frames contain no OS cursor).
    stop: async (pointer = []) => {
      await cdp.send('Page.stopScreencast'); await sleep(300);
      fs.writeFileSync(`${dir}/frames.json`, JSON.stringify({ dpr: DPR, frames, marks, pointer }));
      return frames;
    },
  };
}

export async function box(loc) {
  const b = await loc.first().boundingBox();
  if (!b) throw new Error('no bounding box for ' + loc);
  return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
}

// Visible rect of the nearest scrolling ancestor (or the viewport), so "visible" means not clipped by a panel either.
async function clipRect(loc) {
  return loc.first().evaluate((el) => {
    let e = el.parentElement;
    while (e && e !== document.body && e !== document.documentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed') return { x: 0, y: 0, w: innerWidth, h: innerHeight, scroller: false, fixed: true }; // a fixed layer is not clipped by scrollers around it
      if (/(auto|scroll|hidden)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, scroller: true, up: e.scrollTop, down: e.scrollHeight - e.clientHeight - e.scrollTop };
      }
      e = e.parentElement;
    }
    const d = document.scrollingElement;
    return { x: 0, y: 0, w: innerWidth, h: innerHeight, scroller: false, up: d.scrollTop, down: d.scrollHeight - d.clientHeight - d.scrollTop };
  });
}

export class Actor {
  constructor(page, { name = '' } = {}) { this.p = page; this.x = VW / 2; this.y = VH / 2; this.name = name; this.log = []; this.track = []; this.down = false; }
  // All mouse input goes through these three, which record what was sent and when.
  async _move(x, y) { await this.p.mouse.move(x, y); this.track.push({ t: Date.now() / 1000, x, y, down: this.down }); }
  async _down() { await this.p.mouse.down(); this.down = true; this.track.push({ t: Date.now() / 1000, x: this.x, y: this.y, down: true }); }
  async _up() { await this.p.mouse.up(); this.down = false; this.track.push({ t: Date.now() / 1000, x: this.x, y: this.y, down: false }); }
  async place(x, y) { this.x = x; this.y = y; await this._move(x, y); }
  // Eased, slightly arced pointer travel, driven by wall-clock time so slow event handling never stretches it.
  // bend: 0 for drags (an arc would wander onto the next line of text and change the live selection).
  async moveTo(x, y, { ms, bend } = {}) {
    const x0 = this.x, y0 = this.y, dx = x - x0, dy = y - y0, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const dur = ms ?? Math.min(950, Math.max(320, 260 + dist * 0.62));
    const b = bend ?? Math.min(40, dist * 0.06);
    const nx = -dy / dist, ny = dx / dist;
    const t0 = Date.now();
    for (;;) {
      const u = Math.min(1, (Date.now() - t0) / dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const arc = Math.sin(Math.PI * e) * b;
      this.x = x0 + dx * e + nx * arc; this.y = y0 + dy * e + ny * arc;
      await this._move(this.x, this.y);
      if (u >= 1) break;
      await sleep(14);
    }
    this.x = x; this.y = y;
  }
  // Scroll with real wheel input over (atX, atY) until `loc` sits fully inside its clip rect with padding.
  // align: 'nearest' moves the minimum; 'center' centers it in the clip rect.
  async reveal(loc, { pad = 24, topInset = 0, bottomInset = 0, align = 'nearest', at = null, maxTries = 6 } = {}) {
    loc = loc.first();
    for (let k = 0; k < maxTries; k++) {
      const b = await loc.boundingBox(); if (!b) throw new Error('reveal: no box');
      const c = await clipRect(loc);
      if (c.fixed) return;
      const top = c.y + (c.scroller ? 0 : topInset) + pad, bot = c.y + c.h - (c.scroller ? 0 : bottomInset) - pad;
      let delta = 0;
      if (align === 'center') delta = (b.y + b.height / 2) - (top + bot) / 2;
      else if (b.y < top) delta = b.y - top;
      else if (b.y + b.height > bot) delta = Math.min(b.y + b.height - bot, b.y - top);
      // never wheel past the scroller's range: the excess would chain to the page behind it
      delta = Math.max(-c.up, Math.min(c.down, delta));
      if (Math.abs(delta) < 4) return;
      // wheel where the pointer already is when it is over the scroller; otherwise travel to `at` or its middle
      const inside = this.x > c.x + 10 && this.x < c.x + c.w - 10 && this.y > c.y + 10 && this.y < c.y + c.h - 10;
      const ax = inside && !at ? this.x : at ? at[0] : c.x + c.w / 2, ay = inside && !at ? this.y : at ? at[1] : c.y + c.h / 2;
      if (Math.hypot(ax - this.x, ay - this.y) > 6) await this.moveTo(ax, ay);
      await this.wheel(delta);
      await sleep(250);
      const b2 = await loc.boundingBox();
      if (b2 && Math.abs(b2.y - b.y) < 2) return; // cannot scroll further (top/bottom, or a fixed layer)
    }
  }
  async wheel(dy, { pxPerTick = 28, gap = 16 } = {}) {
    const n = Math.max(1, Math.round(Math.abs(dy) / pxPerTick));
    for (let i = 0; i < n; i++) {
      // ease the wheel speed in and out so the scroll reads as a single smooth gesture
      const u = (i + 0.5) / n, w = Math.sin(Math.PI * u) * Math.PI / 2;
      await this.p.mouse.wheel(0, (dy / n) * w); await sleep(gap);
    }
  }
  // Fails the capture if `loc` is not fully inside the viewport and its scrolling panel, with padding.
  async assertVisible(loc, { pad = 8, label = '' } = {}) {
    loc = loc.first();
    const b = await loc.boundingBox(); const c = await clipRect(loc);
    const ok = b && b.x >= Math.max(0, c.x) + pad - 0.5 && b.y >= Math.max(0, c.y) + pad - 0.5 &&
      b.x + b.width <= Math.min(VW, c.x + c.w) - pad + 0.5 && b.y + b.height <= Math.min(VH, c.y + c.h) - pad + 0.5;
    this.log.push({ check: 'visible', label, box: b, clip: c, pad, ok });
    if (!ok) throw new Error(`assertVisible ${label}: ${JSON.stringify(b)} not inside ${JSON.stringify(c)} pad ${pad}`);
    return [b.x, b.y, b.width, b.height];
  }
  async hover(loc, { reveal = true, pad = 24, topInset = 80, dx = 0, dy = 0, ms, label = '' } = {}) {
    loc = loc.first();
    if (reveal) await this.reveal(loc, { pad, topInset });
    const b = await loc.boundingBox(); if (!b) throw new Error('hover: no box ' + label);
    await this.moveTo(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { ms });
    return [b.x, b.y, b.width, b.height];
  }
  async click(loc, { dwell = 260, label = '', visPad = 4, ...o } = {}) {
    const bx = await this.hover(loc, { label, ...o });
    await this.assertVisible(loc, { pad: visPad, label: label || 'click target' });
    await sleep(dwell);
    await this._down(); await sleep(75); await this._up();
    return bx;
  }
  async type(text, { delay = 55 } = {}) {
    for (const ch of text) { await this.p.keyboard.type(ch); await sleep(delay * (0.75 + Math.random() * 0.5)); }
  }
  async key(k, pause = 120) { await this.p.keyboard.press(k); await sleep(pause); }

  // Rects (one per line) of `phrase` inside verse n's text, from a DOM Range. Read-only.
  async phraseRects(n, phrase) {
    return this.p.evaluate(([n, phrase]) => {
      const el = document.querySelector(`[data-verse-selectable='true'][data-verse='${n}']`);
      if (!el) return { err: 'no verse ' + n };
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = []; let full = '';
      while (w.nextNode()) { const t = w.currentNode; if (t.parentElement.closest('.verse-badge,[data-verse-ignore]')) continue; nodes.push([t, full.length]); full += t.data; }
      const i = full.indexOf(phrase); if (i < 0) return { err: 'phrase not found', full: full.slice(0, 200) };
      const loc = (o, end) => { for (let k = nodes.length - 1; k >= 0; k--) if (end ? o > nodes[k][1] : o >= nodes[k][1]) return [nodes[k][0], o - nodes[k][1]]; };
      const r = document.createRange(); const [a, ao] = loc(i, false); const [b, bo] = loc(i + phrase.length, true);
      r.setStart(a, ao); r.setEnd(b, bo);
      // merge client rects into lines
      const lines = [];
      for (const x of r.getClientRects()) {
        if (x.width < 1) continue;
        const mid = x.top + x.height / 2; const L = lines.find((l) => Math.abs(l.mid - mid) < x.height / 2);
        if (L) { L.left = Math.min(L.left, x.left); L.right = Math.max(L.right, x.right); } else lines.push({ mid, left: x.left, right: x.right, top: x.top, bottom: x.bottom });
      }
      return { lines: lines.sort((p, q) => p.mid - q.mid) };
    }, [n, phrase]);
  }
  // Press at the phrase's first character and drag along each line in reading order to its last character.
  async dragSelect(n, phrase, { msPerLine = 1100 } = {}) {
    const r = await this.phraseRects(n, phrase);
    if (!r.lines) throw new Error('dragSelect ' + JSON.stringify(r));
    const L = r.lines;
    await this.moveTo(L[0].left + 1.5, L[0].mid);
    await sleep(220);
    await this._down(); await sleep(90);
    for (let i = 0; i < L.length; i++) {
      const last = i === L.length - 1;
      if (i > 0) await this.moveTo(L[i].left + 2, L[i].mid, { ms: 220, bend: 0 });
      await this.moveTo(last ? L[i].right - 1.5 : L[i].right - 1, L[i].mid, { ms: msPerLine, bend: 0 });
    }
    await sleep(120);
    await this._up();
    await sleep(350);
    const got = await this.p.evaluate(() => getSelection().toString());
    const ok = got.replace(/\s+/g, ' ').trim() === phrase;
    this.log.push({ check: 'selection', want: phrase, got, ok });
    if (!ok) throw new Error(`selection mismatch: want ${JSON.stringify(phrase)} got ${JSON.stringify(got)}`);
    return L;
  }
  // Double-click the k-th occurrence of `word` in verse n (selects the word the way a reader would).
  async dblclickWord(n, word, k = 0) {
    const pt = await this.p.evaluate(([n, word, k]) => {
      const el = document.querySelector(`[data-verse-selectable='true'][data-verse='${n}']`);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let seen = 0;
      while (w.nextNode()) {
        const t = w.currentNode; let i = -1;
        while ((i = t.data.indexOf(word, i + 1)) >= 0) {
          if (seen++ === k) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + word.length); const b = r.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }
        }
      }
      return null;
    }, [n, word, k]);
    if (!pt) throw new Error('word not found ' + word);
    await this.moveTo(pt[0], pt[1]); await sleep(300);
    for (const clickCount of [1, 2]) { // a real double-click: the second press carries clickCount 2
      await this.p.mouse.down({ clickCount }); this.down = true; this.track.push({ t: Date.now() / 1000, x: this.x, y: this.y, down: true });
      await sleep(55);
      await this.p.mouse.up({ clickCount }); this.down = false; this.track.push({ t: Date.now() / 1000, x: this.x, y: this.y, down: false });
      await sleep(70);
    }
    await sleep(350);
    const got = await this.p.evaluate(() => getSelection().toString().trim());
    const ok = got === word; this.log.push({ check: 'selection', want: word, got, ok });
    if (!ok) throw new Error(`word selection mismatch: ${got}`);
    return pt;
  }
}

export async function go(page, path, wait = 1800) {
  await page.goto(B + path, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(wait);
}
export async function dismissTip(page) {
  const t = page.getByRole('button', { name: 'Got it' });
  if (await t.count()) { await t.first().click().catch(() => {}); await sleep(300); }
}
