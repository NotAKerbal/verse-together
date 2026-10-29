import fs from 'node:fs';
import { Actor, B, box, dismissTip, go, launch, sleep, startCast } from './capture-lib.mjs';
const ROOT = process.env.VT_GUIDE_WORK || process.env.HOME + '/.cache/vt-feature-guide';
const RAW = process.env.VT_RAW || ROOT + '/raw', PROF = process.env.VT_PROFILES || ROOT + '/profiles';
const want = new Set(process.argv.slice(2));
const P1 = 'faith is not to have a perfect knowledge of things';
const P2 = 'hope for things which are not seen, which are true';
const P3 = 'God is merciful unto all who believe on his name';
const P41 = 'if ye will nourish the word';
const sessions = {}, wiped = new Set();
async function session(name, fresh) {
    if (sessions[name])
        return sessions[name];
    const dir = `${PROF}/${name}`;
    if (fresh && !wiped.has(name)) {
        fs.rmSync(dir, { recursive: true, force: true });
        wiped.add(name);
    }
    return (sessions[name] = await launch(dir));
}
async function closeSession(name) { if (sessions[name]) {
    await sessions[name].ctx.close();
    delete sessions[name];
} }
const report = fs.existsSync(`${RAW}/capture-report.json`) ? JSON.parse(fs.readFileSync(`${RAW}/capture-report.json`)) : {};
async function scene(name, prof, { fresh = true } = {}, pre, body, verify, post) {
    if (want.size && !want.has(name))
        return;
    const { page } = await session(prof, fresh);
    const a = new Actor(page, { name });
    console.log('scene', name);
    const dir = `${RAW}/${name}`;
    fs.rmSync(dir, { recursive: true, force: true });
    const rec = { profile: prof, revision: process.env.VT_REV || null, base: B, ok: false, checks: a.log, verify: null, error: null, at: new Date().toISOString() };
    try {
        await pre(page, a);
        await sleep(500);
        const cast = await startCast(page, dir);
        await sleep(400);
        cast.mark('rec');
        await body(page, a, cast);
        cast.mark('end');
        await sleep(400);
        const fr = await cast.stop(a.track);
        console.log('  frames', fr.length, 'span', (fr.at(-1).t - fr[0].t).toFixed(2));
        rec.frames = fr.length;
        if (verify)
            rec.verify = await verify(page, a);
        rec.ok = !rec.verify || rec.verify.ok !== false;
        if (!rec.ok)
            console.log('  VERIFY FAILED', JSON.stringify(rec.verify).slice(0, 400));
        if (post)
            await post(page, a);
    }
    catch (e) {
        rec.error = e.message.split('\n')[0];
        console.log('  ERROR', name, rec.error, (e.stack.match(/capture.mjs:\d+/g) || []).join(' '));
        await page.screenshot({ path: `${RAW}/${name}-error.png` }).catch(() => { });
    }
    report[name] = rec;
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(`${RAW}/capture-report.json`, JSON.stringify(report, null, 1));
}
const urlIs = (page, re) => page.waitForURL(re, { timeout: 20000 });
const pop = (p, t) => p.locator('[data-selection-popover] button', { hasText: t }).first();
const verseMarks = (page, n) => page.evaluate((n) => [...document.querySelectorAll(`[data-verse='${n}'] .verse-mark`)]
    .filter((e) => e.attributes.length > 1 && !e.hasAttribute('data-verse-text'))
    .map((e) => ({ attrs: [...e.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `${x.name}=${x.value}`), text: e.textContent })), n);
async function settleVerse(page, a, n, align = 'center') {
    await a.reveal(page.locator(`#v-${n}`), { align, topInset: 80, at: [640, 420] });
    await sleep(500);
}
const selectedTab = (p, name) => p.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim() === n, name, { timeout: 8000 });
const tab = (p, name) => p.getByRole('tab', { name, exact: true });
const readerPanel = (p) => p.locator('div.overflow-y-auto').filter({ hasText: 'Simple mode' }).first();
async function waitLibrary(p) {
    await p.waitForFunction(() => { try {
        return JSON.parse(localStorage.getItem('scripture-browser-storage-status') || '{}').state === 'ready';
    }
    catch {
        return false;
    } }, null, { timeout: 180000, polling: 1000 });
}
const HOLD = 2800;
await scene('browse_library', 'browse', {}, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32');
    await dismissTip(p);
    await go(p, '/browse', 2200);
    await a.place(560, 470);
}, async (p, a, c) => {
    await sleep(900);
    c.mark('library', { card: await box(p.locator('a[href="/browse/bookofmormon"]')) });
    await a.click(p.locator('a[href="/browse/bookofmormon"]'), { dwell: 400 });
    await urlIs(p, /\/browse\/bookofmormon$/);
    await sleep(1300);
    c.mark('books', { alma: await box(p.locator('a[href="/browse/bookofmormon/alma"]')) });
    await a.click(p.locator('a[href="/browse/bookofmormon/alma"]'), { dwell: 400 });
    await urlIs(p, /\/alma$/);
    await sleep(1200);
    c.mark('chapters', { c32: await box(p.locator('a[href="/browse/bookofmormon/alma/32"]')) });
    await a.click(p.locator('a[href="/browse/bookofmormon/alma/32"]'), { dwell: 400 });
    await urlIs(p, /\/alma\/32/);
    await p.locator('#v-1').waitFor();
    await sleep(400);
    await a.moveTo(1180, 470, { ms: 600 });
    c.mark('reader', { v1: await box(p.locator('#v-1')), crumbs: await box(p.getByRole('navigation', { name: 'Breadcrumb' })) });
    await sleep(HOLD);
}, async (p) => ({ ok: /alma\/32/.test(p.url()), url: p.url() }));
await scene('browse_grid', 'browse', { fresh: false }, async (p, a) => { await go(p, '/browse/bookofmormon/alma/32', 2000); await dismissTip(p); await a.place(1100, 400); }, async (p, a, c) => {
    await sleep(900);
    const crumb = p.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Alma 32' });
    c.mark('start', { crumbs: await box(p.getByRole('navigation', { name: 'Breadcrumb' })) });
    await a.click(crumb, { reveal: false, dwell: 500 });
    await urlIs(p, /\/alma$/);
    await sleep(1400);
    const c33 = p.locator('a[href="/browse/bookofmormon/alma/33"]');
    c.mark('grid', { c33: await box(c33) });
    await a.click(c33, { dwell: 500 });
    await urlIs(p, /\/alma\/33/);
    await p.locator('#v-1').waitFor();
    await sleep(400);
    await a.moveTo(1180, 470, { ms: 600 });
    c.mark('alma33', { v1: await a.assertVisible(p.locator('#v-1'), { pad: 4, label: 'Alma 33:1' }), crumbs: await box(p.getByRole('navigation', { name: 'Breadcrumb' })) });
    await sleep(HOLD);
}, async (p) => ({ ok: /alma\/33/.test(p.url()), url: p.url() }));
await scene('search_reference', 'browse', { fresh: false }, async (p, a) => { await go(p, '/browse/bookofmormon/alma/33', 2000); await dismissTip(p); await a.place(1100, 400); }, async (p, a, c) => {
    await sleep(800);
    await a.click(p.getByRole('button', { name: 'Search scriptures' }), { reveal: false, dwell: 400 });
    await sleep(600);
    const input = p.getByRole('combobox').first();
    c.mark('open', { input: await box(input) });
    await a.type('Moroni 10:4', { delay: 110 });
    await sleep(1100);
    c.mark('typed', { input: await box(input), list: await box(p.getByRole('listbox').first()).catch(() => null) });
    await sleep(500);
    await a.key('Enter');
    await urlIs(p, /moroni\/10/);
    await p.locator('#v-4').waitFor();
    await sleep(800);
    await a.moveTo(1180, 560, { ms: 600 });
    c.mark('landed', { v4: await a.assertVisible(p.locator('#v-4'), { pad: 6, label: 'Moroni 10:4' }) });
    await sleep(HOLD);
}, async (p) => ({ ok: /moroni\/10/.test(p.url()), url: p.url() }));
await scene('search_phrase', 'browse', { fresh: false }, async (p, a) => {
    await go(p, '/search', 2000);
    await waitLibrary(p);
    await go(p, '/browse', 2200);
    await a.place(1100, 300);
}, async (p, a, c) => {
    await sleep(800);
    const cb = p.getByRole('combobox', { name: 'Search scriptures or jump to a reference' });
    await a.click(cb, { reveal: false, dwell: 400 });
    await sleep(300);
    await a.type('nourish the word', { delay: 100 });
    await sleep(900);
    c.mark('typed', { cb: await box(cb) });
    await a.key('Enter');
    await urlIs(p, /\/search\?q=/);
    const hit = p.getByText('Matched verses 40', { exact: false }).first();
    await hit.waitFor({ timeout: 20000 });
    await sleep(900);
    const card = p.locator('main article, main li, main section').filter({ hasText: 'Matched verses 40' }).last();
    await a.moveTo(1150, 560, { ms: 600 });
    c.mark('results', { card: await box(card) });
    await sleep(2200);
    const open = p.getByText('Open chapter', { exact: true }).first();
    await a.hover(open, { reveal: false, ms: 600 });
    c.mark('open', { open: await box(open) });
    await sleep(1800);
}, async (p) => {
    const t = await p.locator('main').innerText();
    return { ok: /VERSE 41/i.test(t) && /nourish/i.test(t), text: t.slice(0, 400) };
});
await scene('reading_settings', 'prefs', {}, async (p, a) => { await go(p, '/browse/bookofmormon/alma/32', 2200); await dismissTip(p); await settleVerse(p, a, 21); await a.place(1000, 400); }, async (p, a, c) => {
    await sleep(900);
    c.mark('before', { v21: await box(p.locator('#v-21')) });
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 400 });
    await sleep(800);
    const range = p.locator('input[type=range]').first();
    const rb = await range.boundingBox();
    const [mn, mx, v] = await range.evaluate((e) => [Number(e.min), Number(e.max), Number(e.value)]);
    c.mark('open', { panel: await box(readerPanel(p)), range: [rb.x, rb.y, rb.width, rb.height] });
    await sleep(600);
    const xAt = (val) => rb.x + rb.width * (val - mn) / (mx - mn);
    await a.moveTo(xAt(v), rb.y + rb.height / 2);
    await sleep(250);
    await a._down();
    await sleep(120);
    await a.moveTo(xAt(1.2), rb.y + rb.height / 2, { ms: 1200, bend: 0 });
    await sleep(150);
    await a._up();
    await sleep(800);
    const pct = await range.evaluate((e) => Math.round(Number(e.value) * 100));
    a.log.push({ check: 'text size', got: pct, ok: pct >= 117 && pct <= 123 });
    c.mark('size', { panel: await box(readerPanel(p)) });
    await sleep(700);
    await a.click(p.getByRole('button', { name: 'Sans', exact: true }), { reveal: false, dwell: 400 });
    await sleep(1100);
    c.mark('sans');
    await a.click(p.getByRole('button', { name: 'Wide', exact: true }), { reveal: false, dwell: 400 });
    await sleep(1100);
    c.mark('wide', { panel: await box(readerPanel(p)) });
    await a.click(gear, { reveal: false, dwell: 350 });
    await sleep(500);
    await a.moveTo(1240, 640, { ms: 600 });
    await sleep(300);
    c.mark('result', { v21: await box(p.locator('#v-21')) });
    await sleep(HOLD);
}, async (p) => {
    const pct = await p.evaluate(() => document.documentElement.style.cssText || '');
    return { ok: true, style: pct.slice(0, 200) };
});
await scene('reading_simple', 'prefs', { fresh: false }, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32', 2200);
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.place(1000, 400);
}, async (p, a, c) => {
    await sleep(900);
    const eye = p.getByRole('button', { name: 'Turn simple mode on' });
    c.mark('before', { eye: await box(eye) });
    await a.click(eye, { reveal: false, dwell: 450 });
    await sleep(1100);
    await a.moveTo(1150, 420, { ms: 700 });
    await sleep(400);
    const exit = p.getByRole('button', { name: 'Exit simple mode' });
    c.mark('simple', { exit: await a.assertVisible(exit, { pad: 4, label: 'exit pill' }) });
    await sleep(2600);
    await a.click(exit, { reveal: false, dwell: 450 });
    await sleep(1100);
    await a.moveTo(1150, 420, { ms: 600 });
    c.mark('back', { eye: await box(p.getByRole('button', { name: 'Turn simple mode on' })) });
    await sleep(1800);
}, async (p) => ({ ok: (await p.getByRole('button', { name: 'Turn simple mode on' }).count()) > 0 }));
await scene('bibles_add', 'bible', {}, async (p, a) => { await go(p, '/account#bible-translations', 2500); await selectedTab(p, 'Translations'); await a.place(900, 500); }, async (p, a, c) => {
    await sleep(900);
    c.mark('list', { card: await box(p.getByRole('list', { name: 'Your Bibles' }).first()) });
    await a.click(p.getByRole('button', { name: /Add Bible/ }).first(), { dwell: 400 });
    await sleep(1400);
    const bibles = p.locator('ul[aria-label=Bibles]');
    await bibles.waitFor();
    c.mark('catalog', { list: await box(bibles) });
    await sleep(1000);
    await a.click(bibles.locator('button[aria-label="Add Berean Standard Bible"]'), { dwell: 450 });
    await sleep(1300);
    c.mark('added1', { list: await box(p.getByRole('dialog').getByRole('list', { name: 'Your Bibles' })) });
    await sleep(HOLD);
}, async (p) => ({ ok: (await p.getByRole('dialog').getByRole('list', { name: 'Your Bibles' }).innerText()).includes('Berean Standard Bible') }));
await scene('bibles_language', 'bible', { fresh: false }, async (p, a) => {
    await a.place(900, 500);
}, async (p, a, c) => {
    await sleep(800);
    const dlg = p.getByRole('dialog');
    const addAgain = dlg.getByRole('button', { name: /Add Bible/ });
    if (await addAgain.count()) {
        await a.click(addAgain, { dwell: 400 });
        await sleep(1200);
    }
    await a.click(p.getByRole('button', { name: /Change language/ }), { dwell: 400 });
    await sleep(900);
    await a.click(p.getByLabel('Find a language'), { dwell: 300 });
    await a.type('espa', { delay: 140 });
    await sleep(800);
    c.mark('lang', { langs: await box(p.locator('ul[aria-label=Languages]')) });
    await a.click(p.locator('ul[aria-label=Languages] button').first(), { dwell: 400 });
    await sleep(1500);
    c.mark('spanish', { list: await box(p.locator('ul[aria-label=Bibles]')) });
    await sleep(800);
    await a.click(p.locator('ul[aria-label=Bibles] button[aria-label^="Add La Biblia en Español Sencillo"]'), { dwell: 450 });
    await sleep(1300);
    c.mark('added2', { list: await box(p.getByRole('dialog').getByRole('list', { name: 'Your Bibles' })) });
    await sleep(1200);
    await a.click(p.getByRole('button', { name: 'Done' }), { dwell: 350 });
    await sleep(1000);
    await a.moveTo(1050, 560, { ms: 600 });
    c.mark('done', { list: await a.assertVisible(p.getByRole('list', { name: 'Your Bibles' }).first(), { pad: 6, label: 'saved bibles' }) });
    await sleep(HOLD);
}, async (p) => {
    const t = await p.getByRole('list', { name: 'Your Bibles' }).first().innerText();
    return { ok: /Berean Standard Bible/.test(t) && /Español Sencillo/.test(t), list: t.split('\n') };
});
await scene('compare', 'bible', { fresh: false }, async (p, a) => {
    await go(p, '/browse/newtestament/john/1', 2500);
    await dismissTip(p);
    await a.place(1000, 420);
}, async (p, a, c) => {
    await sleep(900);
    c.mark('before', { v1: await box(p.locator('#v-1')) });
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 400 });
    await sleep(800);
    const sw = p.getByRole('switch', { name: 'Show Berean Standard Bible' });
    await a.reveal(sw, { pad: 40 });
    await sleep(400);
    c.mark('list', { sw: await a.assertVisible(sw, { pad: 8, label: 'show BSB switch' }), panel: await box(readerPanel(p)) });
    await sleep(900);
    await a.click(sw, { reveal: false, dwell: 450 });
    await sleep(1300);
    if ((await sw.getAttribute('aria-checked')) !== 'true')
        throw new Error('BSB not shown');
    c.mark('shown', { panel: await box(readerPanel(p)) });
    await a.click(gear, { reveal: false, dwell: 350 });
    await sleep(700);
    await a.moveTo(1240, 600, { ms: 600 });
    await sleep(300);
    c.mark('inline', { v2: await box(p.locator('#v-2')), v3: await box(p.locator('#v-3')), v1: await box(p.locator('#v-1')) });
    await sleep(3600);
    c.mark('sbs_start');
    await sleep(300);
    await a.click(gear, { reveal: false, dwell: 400 });
    await sleep(800);
    const sbs = readerPanel(p).getByRole('button', { name: 'Side by side', exact: true });
    await a.reveal(sbs, { pad: 24 });
    await sleep(300);
    c.mark('sbs_list', { sbs: await a.assertVisible(sbs, { pad: 6, label: 'side by side' }), panel: await box(readerPanel(p)) });
    await sleep(600);
    await a.click(sbs, { reveal: false, dwell: 400 });
    await sleep(1000);
    await a.click(gear, { reveal: false, dwell: 350 });
    await sleep(700);
    await a.moveTo(1240, 640, { ms: 600 });
    await sleep(300);
    c.mark('sbs', { v2: await box(p.locator('#v-2')), v3: await box(p.locator('#v-3')) });
    await sleep(3600);
}, async (p) => {
    const t = await p.evaluate(() => document.getElementById('v-3')?.innerText || '');
    return { ok: /Through Him all things were made/.test(t) && /All things were made by him/.test(t), v3: t.slice(0, 300) };
}, async (p, a) => {
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 100 });
    await sleep(700);
    const inl = readerPanel(p).getByRole('button', { name: 'Inline', exact: true });
    await a.reveal(inl, { pad: 24 });
    await a.click(inl, { reveal: false, dwell: 100 });
    await sleep(500);
    await a.click(gear, { reveal: false, dwell: 100 });
    await sleep(500);
});
await scene('bibles_default', 'bible', { fresh: false }, async (p, a) => {
    await go(p, '/browse/newtestament/john/1', 2500);
    await dismissTip(p);
    await a.place(1000, 420);
}, async (p, a, c) => {
    await sleep(900);
    c.mark('before', { v1: await box(p.locator('#v-1')) });
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 400 });
    await sleep(800);
    const mk = p.getByRole('button', { name: 'Use Berean Standard Bible as default' });
    await a.reveal(mk, { pad: 40 });
    await sleep(300);
    c.mark('list', { mk: await a.assertVisible(mk, { pad: 6, label: 'make default' }), panel: await box(readerPanel(p)) });
    await sleep(900);
    await a.click(mk, { reveal: false, dwell: 450 });
    await p.waitForFunction(() => /He was with God in the beginning/.test(document.getElementById('v-2')?.innerText || ''), null, { timeout: 15000 });
    await sleep(1200);
    c.mark('defaulted', { panel: await box(readerPanel(p)) });
    await a.click(gear, { reveal: false, dwell: 350 });
    await sleep(700);
    await a.moveTo(1240, 600, { ms: 600 });
    await sleep(300);
    c.mark('bsb', { v2: await box(p.locator('#v-2')), v1: await box(p.locator('#v-1')) });
    await sleep(HOLD);
}, async (p) => ({ ok: /He was with God in the beginning/.test(await p.locator('#v-2').innerText()) }), async (p, a) => {
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 100 });
    await sleep(700);
    const kjv = p.getByRole('button', { name: 'Use King James Bible (LDS edition) as default' });
    await a.reveal(kjv, { pad: 40 });
    await a.click(kjv, { reveal: false, dwell: 100 });
    await p.waitForFunction(() => /The same was in the beginning with God/.test(document.getElementById('v-2')?.innerText || ''), null, { timeout: 15000 });
});
await scene('jst', 'jst', {}, async (p, a) => { await go(p, '/browse/newtestament/matthew/7', 2500); await dismissTip(p); await a.place(900, 420); }, async (p, a, c) => {
    await sleep(1000);
    c.mark('before', { v1: await box(p.locator('#v-1')), v2: await box(p.locator('#v-2')) });
    const gear = p.getByRole('button', { name: 'Reader settings' });
    await a.click(gear, { reveal: false, dwell: 400 });
    await sleep(800);
    const sum = p.locator('summary', { hasText: 'Joseph Smith Translation' });
    await a.reveal(sum, { pad: 40 });
    await sleep(300);
    await a.click(sum, { reveal: false, dwell: 400 });
    await sleep(700);
    const det = p.locator('details', { hasText: 'Joseph Smith Translation' });
    const sw = p.getByRole('switch', { name: 'Joseph Smith Translation (JST)' });
    await a.reveal(det, { pad: 16 });
    await sleep(300);
    await a.hover(sw, { reveal: false, ms: 600 });
    const swBox = await a.assertVisible(sw, { pad: 12, label: 'JST switch' });
    const detBox = await a.assertVisible(det, { pad: 4, label: 'JST section' });
    c.mark('jst_pre', { sw: swBox, det: detBox, panel: await box(readerPanel(p)) });
    await sleep(1400);
    await a._down();
    await sleep(75);
    await a._up();
    await sleep(1200);
    if ((await sw.getAttribute('aria-checked')) !== 'true')
        throw new Error('JST switch did not turn on');
    c.mark('jst_on', { sw: await box(sw), det: await box(det), panel: await box(readerPanel(p)) });
    await sleep(900);
    await a.click(gear, { reveal: false, dwell: 300 });
    await sleep(700);
    const banner = p.getByText('JST passages read in place', { exact: false }).first();
    await a.reveal(banner, { pad: 10, topInset: 70, at: [1205, 420] });
    await a.moveTo(1205, 600, { ms: 600 });
    await sleep(300);
    c.mark('after', { v1: await a.assertVisible(p.locator('#v-1'), { pad: 4, label: 'JST v1' }), v3: await box(p.locator('#v-3')), banner: await box(banner) });
    await sleep(3600);
}, async (p) => {
    const ins = await p.evaluate(() => [...document.querySelectorAll('ins.jst-added')].map((e) => e.textContent).slice(0, 6));
    return { ok: ins.length > 0, ins };
});
await scene('faith', 'faith', {}, async (p, a) => {
    await go(p, '/account#reading', 2500);
    await selectedTab(p, 'Reading');
    await a.place(700, 600);
    const card = p.locator('section[aria-labelledby="faith-tradition-title"]');
    await a.reveal(card, { pad: 20, topInset: 90 });
    await sleep(500);
}, async (p, a, c) => {
    await sleep(900);
    const card = p.locator('section[aria-labelledby="faith-tradition-title"]');
    c.mark('card', { card: await a.assertVisible(card, { pad: 6, label: 'faith card' }), nav: await box(p.getByRole('navigation', { name: 'Primary' })) });
    await sleep(1400);
    const other = p.getByRole('radio', { name: 'Other denominations' });
    await a.click(p.locator('label', { has: other }), { reveal: false, dwell: 450 });
    await sleep(1200);
    if (!(await other.isChecked()))
        throw new Error('Other not chosen');
    c.mark('other', { card: await box(card), nav: await box(p.getByRole('navigation', { name: 'Primary' })) });
    await sleep(1800);
    await a.click(p.getByRole('link', { name: 'Browse', exact: true }), { reveal: false, dwell: 450 });
    await urlIs(p, /\/browse$/);
    await sleep(1400);
    await a.moveTo(900, 640, { ms: 600 });
    c.mark('library', { main: await box(p.locator('main').first()), nav: await box(p.getByRole('navigation', { name: 'Primary' })) });
    await sleep(HOLD);
}, async (p) => ({ ok: (await p.getByRole('link', { name: 'Come Follow Me', exact: true }).count()) === 0 }), async (p) => {
    await go(p, '/account#reading', 2000);
    await p.getByRole('radio', { name: 'Church of Jesus Christ of Latter-day Saints' }).check({ force: true });
    await sleep(800);
});
await scene('marks_highlight', 'marks', {}, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32');
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.moveTo(1150, 560);
}, async (p, a, c) => {
    await sleep(900);
    c.mark('verse', { verse: await box(p.locator('#v-21')) });
    await a.dragSelect(21, P1, { msPerLine: 1500 });
    c.mark('sel1', { verse: await box(p.locator('#v-21')), pop: await box(p.locator('[data-selection-popover]')) });
    await sleep(1300);
    await a.click(p.locator('[data-selection-popover] button[aria-label="Yellow highlight"]'), { reveal: false, dwell: 500 });
    await sleep(160);
    c.mark('applied1');
    await sleep(700);
    await a.key('Escape', 200);
    await a.moveTo(1185, 600, { ms: 600 });
    c.mark('hl1', { verse: await box(p.locator('#v-21')) });
    await sleep(HOLD);
}, async (p) => {
    const v21 = await verseMarks(p, 21);
    return { ok: v21.some((m) => m.text === P1 && m.attrs.some((x) => /yellow/.test(x))), v21 };
});
await scene('marks_underline', 'marks', { fresh: false }, async (p, a) => {
    await settleVerse(p, a, 21);
    await a.moveTo(1150, 560);
}, async (p, a, c) => {
    await sleep(800);
    c.mark('verse', { verse: await box(p.locator('#v-21')) });
    await a.dragSelect(21, P2, { msPerLine: 1300 });
    c.mark('sel2', { verse: await box(p.locator('#v-21')), pop: await box(p.locator('[data-selection-popover]')) });
    await sleep(900);
    await a.click(pop(p, 'Annotate'), { reveal: false, dwell: 450 });
    await sleep(1000);
    c.mark('panel', { pop: await box(p.locator('[data-selection-popover]')) });
    await sleep(900);
    const pk = p.locator('[data-selection-popover] [aria-label="Mark style"] [role=radio]', { hasText: 'Underline' }).first();
    await a.click(pk, { reveal: false, dwell: 400 });
    await sleep(700);
    const blue = p.locator('[data-selection-popover] [aria-label="Mark color"] [role=radio][aria-label^="Blue"]').first();
    await a.click(blue, { reveal: false, dwell: 400 });
    await sleep(800);
    const apply = p.locator('[data-selection-popover] button.selection-annotate-apply', { hasText: /blue underline/i }).first();
    c.mark('styled', { pop: await box(p.locator('[data-selection-popover]')), apply: await a.assertVisible(apply, { pad: 4, label: 'apply' }) });
    await sleep(900);
    await a.click(apply, { reveal: false, dwell: 450 });
    await sleep(160);
    c.mark('applied2');
    await sleep(800);
    await a.key('Escape', 200);
    await a.key('Escape', 200);
    await a.moveTo(1185, 600, { ms: 600 });
    c.mark('final', { verse: await box(p.locator('#v-21')) });
    await sleep(HOLD);
}, async (p) => {
    const v21 = await verseMarks(p, 21);
    return { ok: v21.some((m) => m.text === P2 && m.attrs.some((x) => /underline|blue/.test(x))), v21 };
});
await scene('marks_remove', 'marks', { fresh: false }, async (p, a) => {
    await settleVerse(p, a, 22);
    await a.moveTo(1185, 560, { ms: 300 });
    await a.dragSelect(22, P3, { msPerLine: 400 });
    await sleep(500);
    await a.click(p.locator('[data-selection-popover] button[aria-label="Green highlight"]'), { reveal: false, dwell: 100 });
    await sleep(800);
    await a.key('Escape', 200);
    await a.moveTo(1185, 600, { ms: 300 });
}, async (p, a, c) => {
    await sleep(1200);
    c.mark('green', { verse: await box(p.locator('#v-22')) });
    await a.dragSelect(22, P3, { msPerLine: 1200 });
    await sleep(600);
    const g = p.locator('[data-selection-popover] button[aria-label="Green highlight"]');
    if ((await g.getAttribute('aria-pressed')) !== 'true')
        throw new Error('green not pressed on reselect');
    c.mark('pressed', { pop: await box(p.locator('[data-selection-popover]')), g: await box(g) });
    await sleep(1300);
    await a.click(g, { reveal: false, dwell: 450 });
    await sleep(900);
    await a.key('Escape', 200);
    await a.moveTo(1185, 600, { ms: 600 });
    c.mark('removed', { verse: await box(p.locator('#v-22')), v21: await box(p.locator('#v-21')) });
    await sleep(HOLD);
}, async (p) => {
    await p.reload({ waitUntil: 'load' });
    await p.waitForLoadState('networkidle').catch(() => { });
    await sleep(1500);
    const v21 = await verseMarks(p, 21), v22 = await verseMarks(p, 22);
    return { ok: v22.length === 0 && v21.length >= 2, v21, v22 };
});
await scene('quickmarks_name', 'marks', { fresh: false }, async (p, a) => { await go(p, '/account#study-tools', 2200); await selectedTab(p, 'Study tools'); await a.place(700, 560); }, async (p, a, c) => {
    await sleep(900);
    const row = p.locator('li[data-index="0"]');
    c.mark('tools', { row: await a.assertVisible(row, { pad: 8, label: 'first quick mark' }), head: await box(p.locator('#quick-mark-settings-title')) });
    await sleep(1200);
    const name = p.getByPlaceholder('Name (optional)').first();
    await a.click(name, { dwell: 400, label: 'quick mark name' });
    await sleep(200);
    await a.type('Promises', { delay: 120 });
    await sleep(600);
    c.mark('typed');
    const away = await p.evaluate(() => {
        const h = document.querySelector('#quick-mark-settings-title').getBoundingClientRect();
        const x = h.right + 320, y = h.top + h.height / 2, el = document.elementFromPoint(x, y);
        return { x, y, interactive: !!el?.closest('button,a,input,label,[role=button],[tabindex]'), text: (el?.childElementCount === 0 ? el.textContent : '').slice(0, 40) };
    });
    a.log.push({ check: 'blank click target', ...away, ok: !away.interactive && !away.text });
    if (away.interactive || away.text)
        throw new Error('click-away point is not blank');
    await a.moveTo(away.x, away.y, { ms: 500 });
    await sleep(200);
    await a._down();
    await sleep(75);
    await a._up();
    const head = row.locator('span', { hasText: /^Promises$/ }).first();
    await head.waitFor({ timeout: 8000 });
    await p.waitForFunction(() => !/Saving/.test(document.querySelector('#quick-mark-settings-title')?.parentElement?.textContent || ''), null, { timeout: 8000 });
    await sleep(300);
    await a.moveTo(away.x + 40, away.y + 18, { ms: 400 });
    c.mark('named', { head: await a.assertVisible(head, { pad: 4, label: 'named head' }), row: await box(row) });
    await sleep(HOLD);
}, async (p) => {
    await p.reload({ waitUntil: 'load' });
    await sleep(1500);
    const v = await p.getByPlaceholder('Name (optional)').first().inputValue();
    return { ok: v === 'Promises', value: v };
});
await scene('quickmarks_use', 'marks', { fresh: false }, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32', 2200);
    await dismissTip(p);
    await settleVerse(p, a, 41);
    await a.moveTo(1150, 600);
}, async (p, a, c) => {
    await sleep(800);
    await a.dragSelect(41, P41, { msPerLine: 1300 });
    await sleep(800);
    await a.click(pop(p, 'Annotate'), { reveal: false, dwell: 400 });
    await sleep(900);
    const btn = p.locator('[data-selection-popover] button', { hasText: 'Promises' }).first();
    c.mark('panel', { btn: await a.assertVisible(btn, { pad: 4, label: 'Promises button' }), pop: await box(p.locator('[data-selection-popover]')) });
    await sleep(1300);
    await a.click(btn, { reveal: false, dwell: 450 });
    await sleep(800);
    await a.key('Escape', 200);
    await a.key('Escape', 200);
    await a.moveTo(1185, 620, { ms: 600 });
    c.mark('done', { verse: await box(p.locator('#v-41')) });
    await sleep(HOLD);
}, async (p) => {
    const m = await verseMarks(p, 41);
    return { ok: m.some((x) => x.text === P41), marks: m };
});
await scene('explore_helps', 'explore', {}, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32');
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.moveTo(1000, 560);
}, async (p, a, c) => {
    await sleep(900);
    await a.dblclickWord(21, 'faith', 0);
    c.mark('sel', { pop: await box(p.locator('[data-selection-popover]')) });
    await sleep(1100);
    await a.click(pop(p, 'Explore'), { reveal: false, dwell: 450 });
    const helps = p.getByText('Study helps', { exact: true }).first();
    await helps.waitFor({ timeout: 20000 });
    await sleep(1400);
    c.mark('panel', { helps: await box(helps) });
    await sleep(900);
    await a.click(helps, { dwell: 400 });
    await sleep(1200);
    c.mark('helps');
    await sleep(500);
    const bd = p.getByText('Bible Dictionary', { exact: true }).last();
    await a.click(bd, { dwell: 400 });
    const def = p.getByText('Faith is to hope for things which are not seen', { exact: false }).first();
    await def.waitFor({ timeout: 20000 });
    await sleep(500);
    await a.reveal(p.getByRole('button', { name: 'Read more' }).first(), { pad: 16 });
    await a.moveTo(1235, 600, { ms: 600 });
    c.mark('definition', { def: await a.assertVisible(def, { pad: 6, label: 'BD definition' }) });
    await sleep(3600);
}, async (p) => ({ ok: (await p.getByText('Faith is to hope for things which are not seen').count()) > 0 }));
await scene('explore_languages', 'explore', { fresh: false }, async (p, a) => {
    await go(p, '/browse/newtestament/john/1', 2500);
    await dismissTip(p);
    await a.moveTo(1000, 420);
}, async (p, a, c) => {
    await sleep(900);
    await a.dblclickWord(1, 'Word', 0);
    await sleep(900);
    await a.click(pop(p, 'Explore'), { reveal: false, dwell: 400 });
    const langs = p.getByText('Biblical languages', { exact: true }).first();
    await langs.waitFor({ timeout: 20000 });
    await sleep(1600);
    c.mark('panel', { langs: await box(langs) });
    await sleep(700);
    await a.click(langs, { dwell: 400 });
    await sleep(1500);
    const note = p.getByText('Possibilities to explore, not the word in this verse', { exact: false }).first();
    await a.hover(note, { pad: 20, ms: 600 });
    c.mark('list', { note: await a.assertVisible(note, { pad: 6, label: 'possibilities note' }) });
    await sleep(2600);
    const logos = p.getByRole('button', { name: /λόγος/ }).first();
    await a.click(logos, { dwell: 450, pad: 30 });
    await sleep(1800);
    c.mark('entry');
    await a.moveTo(1235, 600, { ms: 600 });
    await sleep(3400);
    c.mark('entry_hold');
}, async (p) => ({ ok: (await p.getByText(/G3056/).count()) > 0 }));
await scene('study_paths', 'explore', { fresh: false }, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32', 2200);
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.moveTo(820, 560);
}, async (p, a, c) => {
    await sleep(900);
    const bulb = p.locator('[aria-label="Explore study path for verse 21"]');
    await a.hover(bulb, { reveal: false, ms: 700 });
    await sleep(500);
    c.mark('bulb', { bulb: await box(bulb) });
    await sleep(500);
    await a.click(bulb, { reveal: false, dwell: 350 });
    const title = p.getByText('Faith as an experiment rather than a demand for certainty').first();
    await title.waitFor({ timeout: 20000 });
    await sleep(1000);
    c.mark('panel', { title: await box(title) });
    await sleep(2200);
    await a.hover(p.getByText('AS YOU REREAD, NOTICE', { exact: false }).first(), { reveal: false, dx: 190, ms: 800 });
    c.mark('notice');
    await sleep(2600);
    const srcLink = p.locator('a', { hasText: 'churchofjesuschrist.org' }).first();
    await a.hover(srcLink, { reveal: false, ms: 600 });
    c.mark('sources', { sources: await a.assertVisible(p.getByText('Sources', { exact: true }).first(), { pad: 6, label: 'sources' }),
        foot: await a.assertVisible(p.getByText('AI found these directions', { exact: false }).first(), { pad: 6, label: 'ai note' }) });
    await sleep(3200);
}, async (p) => ({ ok: (await p.getByText('AI found these directions').count()) > 0 }));
await scene('notes_new', 'notes', {}, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32');
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.moveTo(1150, 560);
}, async (p, a, c) => {
    await sleep(800);
    await a.dragSelect(21, P2, { msPerLine: 1300 });
    await sleep(800);
    const nn = pop(p, 'New Note');
    c.mark('menu', { nn: await a.assertVisible(nn, { pad: 4, label: 'new note' }) });
    await sleep(900);
    await a.click(nn, { reveal: false, dwell: 450 });
    await sleep(1500);
    const add = pop(p, 'Add to Note');
    c.mark('opened', { add: await a.assertVisible(add, { pad: 4, label: 'add to note' }) });
    await sleep(1000);
    await a.click(add, { reveal: false, dwell: 450 });
    await p.locator('.cm-content').first().getByText('hope for things which are not seen', { exact: false }).waitFor({ timeout: 10000 });
    await sleep(600);
    await a.moveTo(1000, 600, { ms: 500 });
    c.mark('quoted');
    await sleep(HOLD);
    c.mark('write');
    const ed = p.locator('.cm-content').first();
    const eb = await ed.boundingBox();
    await a.moveTo(eb.x + eb.width * 0.6, eb.y + eb.height - 6, { ms: 600 });
    await sleep(200);
    await a._down();
    await sleep(70);
    await a._up();
    await sleep(300);
    await a.key('Control+End', 150);
    await a.key('Enter', 200);
    await a.key('Backspace', 200);
    await a.key('Enter', 250);
    await a.type('Hope reaches toward what is true, even before I can see it.', { delay: 45 });
    await sleep(700);
    await p.getByText(/Saved at/).first().waitFor({ timeout: 15000 });
    await sleep(800);
    await a.moveTo(1000, 640, { ms: 500 });
    c.mark('typed', { saved: await box(p.getByText(/Saved at/).first()) });
    await sleep(HOLD);
}, async (p) => {
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('vt_device_study_v1') || '{}'));
    const n = (d.notes || []).find((x) => /Hope reaches toward/.test(x.markdown_body || ''));
    return { ok: !!n && /hope for things which are not seen/.test(n.markdown_body) && /\n\nHope reaches toward/.test(n.markdown_body), body: n?.markdown_body?.slice(0, 300) || null };
});
await scene('log', 'notes', { fresh: false }, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32', 2200);
    await dismissTip(p);
    await a.place(1000, 400);
    const launcher = p.locator('[data-notebook-launcher]').first();
    if ((await launcher.getAttribute('aria-expanded')) === 'true') {
        await a.click(launcher, { reveal: false, dwell: 100 });
        await sleep(800);
    }
    await a.place(1000, 400);
}, async (p, a, c) => {
    await sleep(900);
    const log = p.locator('[data-notebook-launcher]').first();
    c.mark('btn', { log: await box(log) });
    await a.click(log, { reveal: false, dwell: 450 });
    await sleep(1300);
    const addNote = p.getByRole('button', { name: 'Add a note' });
    c.mark('panel', { add: await a.assertVisible(addNote, { pad: 4, label: 'add a note' }) });
    await sleep(1100);
    await a.click(addNote, { reveal: false, dwell: 350 });
    await sleep(500);
    await a.type('Read the whole chapter slowly. Planting the seed is a choice I can make today.', { delay: 42 });
    await sleep(700);
    c.mark('typed');
    await a.click(p.getByRole('button', { name: 'Save note', exact: true }), { reveal: false, dwell: 450 });
    await sleep(700);
    const saved = p.getByText('Planting the seed is a choice I can make today.', { exact: false }).first();
    await saved.waitFor({ timeout: 10000 });
    await sleep(400);
    await a.moveTo(1030, 640, { ms: 600 });
    c.mark('saved', { entry: await a.assertVisible(saved, { pad: 6, label: 'saved entry' }) });
    await sleep(HOLD);
}, async (p) => {
    const d = await p.evaluate(() => JSON.parse(localStorage.getItem('vt_device_study_v1') || '{}'));
    const n = (d.notes || []).find((x) => /Planting the seed/.test(x.markdown_body || ''));
    return { ok: !!n, entry: n ? { body: n.markdown_body, keys: Object.keys(n) } : null };
});
await scene('journal_goals', 'notes', { fresh: false }, async (p, a) => { await go(p, '/notes', 2800); await a.place(700, 420); }, async (p, a, c) => {
    await sleep(1000);
    c.mark('home');
    const goals = p.getByText('Edit goals');
    await a.click(goals, { dwell: 400 });
    await sleep(900);
    c.mark('modal', { modal: await box(p.getByText('Edit weekly goals').first()) });
    await sleep(900);
    const inc = p.getByRole('button', { name: 'Increase study days per week' });
    await a.click(inc, { reveal: false, dwell: 400 });
    await sleep(800);
    c.mark('six');
    await a.click(p.getByRole('button', { name: 'Save goals' }), { reveal: false, dwell: 400 });
    await sleep(900);
    const goal = p.getByText('Study 6 days a week').first();
    await goal.waitFor({ timeout: 8000 });
    await a.hover(goal, { reveal: false, ms: 600, dy: 18 });
    c.mark('saved', { goal: await a.assertVisible(goal, { pad: 6, label: 'saved goal' }) });
    await sleep(HOLD);
}, async (p) => ({ ok: (await p.getByText('Study 6 days a week').count()) > 0 }));
await scene('journal_prompts', 'notes', { fresh: false }, async (p, a) => { await go(p, '/notes', 2800); await a.place(700, 420); }, async (p, a, c) => {
    await sleep(1000);
    const card = p.locator('section[aria-label="An invitation to reflect"]');
    const choose = p.getByRole('button', { name: /Choose another prompt/ }).first();
    await a.reveal(card, { pad: 30, topInset: 90 });
    const q0 = await card.innerText();
    c.mark('prompt', { card: await box(card) });
    await sleep(800);
    await a.click(choose, { reveal: false, dwell: 400 });
    await sleep(1300);
    const q1 = await card.innerText();
    a.log.push({ check: 'prompt changed', ok: q0 !== q1, q0: q0.slice(0, 120), q1: q1.slice(0, 120) });
    c.mark('prompt2', { card: await box(card) });
    await sleep(1600);
    await a.click(p.getByRole('button', { name: /Write a reflection/ }).first(), { reveal: false, dwell: 400 });
    await sleep(1500);
    await a.moveTo(1000, 640, { ms: 500 });
    c.mark('reflect');
    await sleep(HOLD);
}, null, async (p) => { await p.getByRole('button', { name: 'Close', exact: true }).first().click().catch(() => { }); await sleep(600); });
await scene('journal_day', 'notes', { fresh: false }, async (p, a) => { await go(p, '/notes', 2800); await a.place(700, 420); }, async (p, a, c) => {
    await sleep(900);
    const entry = p.getByText('Alma 32', { exact: false }).first();
    await a.reveal(entry, { pad: 60, topInset: 90 });
    await sleep(500);
    c.mark('entries', { entry: await box(entry) });
    await sleep(1500);
    await a.click(entry, { reveal: false, dwell: 450 });
    await sleep(1700);
    await a.moveTo(1150, 600, { ms: 600 });
    c.mark('opened');
    await sleep(HOLD + 500);
}, async (p) => ({ ok: (await p.getByText('Hope reaches toward what is true', { exact: false }).count()) > 0 }));
await scene('cfm_week', 'cfm', {}, async (p, a) => { await go(p, '/come-follow-me', 3000); await a.place(700, 420); }, async (p, a, c) => {
    await sleep(1000);
    const open = p.getByRole('link', { name: /Open the study guide/ }).first();
    c.mark('week', { open: await box(open) });
    await sleep(1600);
    await a.click(open, { reveal: false, dwell: 450 });
    await urlIs(p, /come-follow-me\/\d{4}-\d{2}-\d{2}/);
    await sleep(2000);
    c.mark('lesson');
    await sleep(900);
    const contents = p.getByRole('button', { name: 'Contents' });
    await a.click(contents, { reveal: false, dwell: 400 });
    await sleep(1100);
    c.mark('contents');
    await sleep(1300);
    await a.moveTo(1150, 600, { ms: 600 });
    await sleep(HOLD - 600);
}, async (p) => ({ ok: /come-follow-me\/\d{4}-/.test(p.url()), url: p.url() }), async (p) => { await p.keyboard.press('Escape'); await sleep(300); });
await scene('cfm_context', 'cfm', { fresh: false }, async (p, a) => {
    await go(p, '/come-follow-me/2026-10-26', 3000);
    await a.place(700, 420);
    const contents = p.getByRole('button', { name: 'Contents' });
    await contents.click();
    await sleep(800);
    await p.getByRole('link', { name: /Jeremiah 31 Mourning Turned to Joy/ }).first().click();
    await sleep(1800);
    const sum = p.locator('details[data-context] > summary', { hasText: 'Context for verses 1–3' }).first();
    await a.reveal(sum, { align: 'center', at: [640, 420] });
    await a.wheel(-200);
    await sleep(900);
}, async (p, a, c) => {
    await sleep(900);
    const sum = p.locator('details[data-context] > summary', { hasText: 'Context for verses 1–3' }).first();
    c.mark('verses', { sum: await box(sum) });
    await sleep(900);
    await a.click(sum, { reveal: false, dwell: 400 });
    await sleep(1100);
    const det = p.locator('details[data-context][open]', { hasText: 'Everlasting Love' }).first();
    await a.reveal(det, { pad: 22, topInset: 70, at: [640, 420] });
    await sleep(400);
    await a.moveTo(1130, 560, { ms: 600 });
    c.mark('context', { ctx: await a.assertVisible(det, { pad: 8, label: 'context card' }) });
    await sleep(3000);
    const xref = det.locator('a', { hasText: 'Jeremiah 30:24' }).first();
    await a.click(xref, { reveal: false, dwell: 450 });
    await sleep(1700);
    const prev = p.getByText('Open Jeremiah 30 in the reader', { exact: false }).first();
    await prev.waitFor({ timeout: 10000 });
    c.mark('preview', { open: await box(prev) });
    await sleep(HOLD + 400);
}, async (p) => ({ ok: (await p.getByText('Open Jeremiah 30 in the reader', { exact: false }).count()) > 0 }));
await scene('cfm_note', 'cfm', { fresh: false }, async (p, a) => { await go(p, '/come-follow-me/2026-10-26', 3000); await a.wheel(380); await sleep(900); await a.place(900, 500); }, async (p, a, c) => {
    await sleep(900);
    const add = p.getByRole('button', { name: 'Add note' }).first();
    c.mark('title', { add: await box(add) });
    await a.click(add, { reveal: false, dwell: 450 });
    await sleep(1600);
    const linked = p.getByText('Linked to', { exact: false }).first();
    await linked.waitFor({ timeout: 8000 });
    await a.moveTo(1000, 640, { ms: 600 });
    c.mark('panel', { linked: await box(linked) });
    await sleep(HOLD + 300);
});
await scene('focus_share', 'share', {}, async (p, a) => {
    await go(p, '/browse/bookofmormon/alma/32');
    await dismissTip(p);
    await settleVerse(p, a, 21);
    await a.moveTo(1150, 560);
}, async (p, a, c) => {
    await sleep(800);
    await a.dragSelect(21, P1, { msPerLine: 1300 });
    await sleep(800);
    const focus = p.locator('[data-selection-popover] a[aria-label="Focus scripture for the selected verses"]');
    c.mark('menu', { focus: await box(focus) });
    await a.click(focus, { reveal: false, dwell: 500 });
    await urlIs(p, /\/share\//);
    await sleep(1700);
    const share = p.locator('.share-button').first();
    c.mark('focus', { share: await box(share) });
    await sleep(1600);
    await a.click(share, { dwell: 450 });
    const copied = p.getByText('Link copied', { exact: true }).first();
    await copied.waitFor({ timeout: 8000 });
    await sleep(300);
    c.mark('copied', { notice: await box(copied), share: await box(share) });
    await sleep(2400);
}, async (p) => {
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
    return { ok: /share\/bookofmormon\/alma\/32\/21/.test(clip), clipboard: clip };
});
await scene('settings_tour', 'settings', {}, async (p, a) => { await go(p, '/account', 2500); await selectedTab(p, 'Account'); await a.place(900, 500); }, async (p, a, c) => {
    const tabs = p.getByRole('tablist', { name: 'Settings' });
    await sleep(900);
    c.mark('account', { tabs: await a.assertVisible(tabs, { pad: 6, label: 'tabs' }) });
    await sleep(1300);
    for (const [name, label] of [['Reading', 'reading'], ['Translations', 'translations'], ['Study tools', 'tools'], ['Release notes', 'notes'], ['Feedback', 'feedback']]) {
        await a.click(tab(p, name), { reveal: false, dwell: 400, visPad: 4, label: name + ' tab' });
        await selectedTab(p, name);
        await sleep(700);
        await a.moveTo(1000, 600, { ms: 500 });
        c.mark(label, { tabs: await box(tabs) });
        await sleep(label === 'notes' ? 2200 : 1300);
    }
    const msg = p.getByPlaceholder('What would make Verse Together better?');
    await a.hover(msg, { reveal: false, ms: 600 });
    c.mark('form', { msg: await a.assertVisible(msg, { pad: 6, label: 'feedback field' }), send: await box(p.getByRole('button', { name: 'Send feedback' })) });
    await sleep(HOLD);
}, async (p) => ({ ok: (await p.getByPlaceholder('What would make Verse Together better?').inputValue()) === '' }));
for (const s of Object.keys(sessions))
    await closeSession(s);
