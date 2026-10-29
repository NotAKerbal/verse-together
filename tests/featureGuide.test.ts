// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import guideMedia from "../src/features/featureGuide/guideMedia.json";
import { GUIDE_GROUPS, GUIDE_SECTIONS } from "../src/features/featureGuide/guide";
import { SETTINGS_TABS } from "../src/features/settings/settingsTabs";
import { getScriptureVolumeLabel, toScriptureVolumeUrlSlug } from "../src/lib/scriptureVolumes";
vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: {
        href: string;
        children: unknown;
    }) => createElement("a", { href, ...rest }, children as never),
}));
const ROOT = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "scripts/feature-guide/clips.json"), "utf8")) as {
    clips: {
        id: string;
    }[];
};
const clips = GUIDE_SECTIONS.flatMap((section) => section.clips);
function mp4Structure(file: Buffer) {
    const top: string[] = [];
    for (let at = 0; at + 8 <= file.length;) {
        let size = file.readUInt32BE(at);
        if (size === 1)
            size = Number(file.readBigUInt64BE(at + 8));
        top.push(file.toString("latin1", at + 4, at + 8));
        if (size < 8)
            break;
        at += size;
    }
    const handlers: string[] = [];
    for (let at = file.indexOf("hdlr"); at !== -1; at = file.indexOf("hdlr", at + 4)) {
        handlers.push(file.toString("latin1", at + 12, at + 16));
    }
    return { top, handlers };
}
describe("feature guide topics", () => {
    test("anchors are unique, URL-safe and belong to a listed group", () => {
        const ids = GUIDE_SECTIONS.map((section) => section.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids)
            expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
        const groups = new Set<string>(GUIDE_GROUPS.map((group) => group.id));
        for (const section of GUIDE_SECTIONS)
            expect(groups.has(section.group)).toBe(true);
        for (const group of GUIDE_GROUPS)
            expect(GUIDE_SECTIONS.some((section) => section.group === group.id)).toBe(true);
    });
    test("anchors never collide with the ids the page gives clips and headings", () => {
        const pageIds = [
            ...GUIDE_SECTIONS.map((section) => `${section.id}-title`),
            ...clips.map((clip) => `${clip.id}-steps`),
            ...GUIDE_GROUPS.map((group) => `group-${group.id}`),
            "guide-topics",
        ];
        for (const section of GUIDE_SECTIONS)
            expect(pageIds).not.toContain(section.id);
    });
    test("every recorded clip is taught exactly once, with steps", () => {
        const used = clips.map((clip) => clip.id);
        expect(new Set(used).size).toBe(used.length);
        expect([...used].sort()).toEqual(Object.keys(guideMedia).sort());
        expect(manifest.clips.map((clip) => clip.id).sort()).toEqual([...used].sort());
        for (const clip of clips)
            expect(clip.steps.length).toBeGreaterThan(0);
    });
    test("each topic's card shows one of its own clips, framed inside the poster", () => {
        for (const section of GUIDE_SECTIONS) {
            const { clip, center, zoom } = section.cover;
            expect(section.clips.map((own) => own.id), section.id).toContain(clip);
            for (const at of center)
                expect(at, section.id).toBeGreaterThanOrEqual(0);
            for (const at of center)
                expect(at, section.id).toBeLessThanOrEqual(1);
            expect(zoom, section.id).toBeGreaterThanOrEqual(1);
            expect(zoom, section.id).toBeLessThanOrEqual(3);
        }
    });
    test("Try it links open pages that exist", () => {
        for (const { tryIt } of GUIDE_SECTIONS) {
            const url = new URL(tryIt.href, "https://example.org");
            const first = url.pathname.split("/")[1];
            expect(existsSync(join(ROOT, "src/app", first)), tryIt.href).toBe(true);
            if (first === "account" && url.hash)
                expect(SETTINGS_TABS as readonly string[]).toContain(url.hash.slice(1));
            if (first === "browse" || first === "share") {
                const [, , volume, book, chapter] = url.pathname.split("/");
                if (volume)
                    expect(toScriptureVolumeUrlSlug(volume), tryIt.href).toBe(volume);
                if (volume)
                    expect(getScriptureVolumeLabel(volume), tryIt.href).not.toBe(volume);
                if (book)
                    expect(Number(chapter), tryIt.href).toBeGreaterThan(0);
            }
        }
    });
    test("teaches nothing about the features being retired", () => {
        const text = JSON.stringify(GUIDE_SECTIONS);
        expect(text).not.toMatch(/study plans?|reading plans?/i);
        expect(text).not.toMatch(/verse notes?|single-verse|Write a note|Your annotation|Add annotation/i);
    });
});
describe("feature guide clips", () => {
    test("each clip has its video and poster, as measured, within budget", () => {
        let total = 0;
        for (const [id, media] of Object.entries(guideMedia)) {
            const video = join(ROOT, "public/feature-guide", `${id}.mp4`);
            const poster = join(ROOT, "public/feature-guide", `${id}.webp`);
            expect(statSync(video).size, id).toBe(media.videoBytes);
            expect(statSync(poster).size, id).toBe(media.posterBytes);
            expect(media.videoBytes, id).toBeLessThan(2000000);
            expect(media.durationSeconds, id).toBeGreaterThan(4);
            expect(media.durationSeconds, id).toBeLessThan(30);
            expect(media.width / media.height).toBeCloseTo(16 / 9, 2);
            total += media.videoBytes + media.posterBytes;
        }
        expect(total).toBeLessThan(30000000);
    });
    test("each video is one silent video track, ready to start playing before it has fully downloaded", () => {
        for (const id of Object.keys(guideMedia)) {
            const { top, handlers } = mp4Structure(readFileSync(join(ROOT, "public/feature-guide", `${id}.mp4`)));
            expect(top.indexOf("moov"), id).toBeGreaterThan(-1);
            expect(top.indexOf("moov"), `${id}: faststart`).toBeLessThan(top.indexOf("mdat"));
            expect(handlers.filter((handler) => handler === "vide"), id).toHaveLength(1);
            expect(handlers, `${id}: no audio`).not.toContain("soun");
        }
    });
});
describe("feature guide page", async () => {
    const { default: FeatureGuidePage, metadata } = await import("../src/app/feature-guide/page");
    const html = renderToStaticMarkup(createElement(FeatureGuidePage));
    test("is reachable by link but kept out of search results", () => {
        expect(metadata.robots).toEqual({ index: false, follow: true });
    });
    test("lists every topic and links each to its section", () => {
        for (const section of GUIDE_SECTIONS) {
            expect(html).toContain(`id="${section.id}"`);
            expect(html).toContain(`href="#${section.id}"`);
        }
    });
    test("downloads no video or poster with the page, and plays nothing by itself", () => {
        const videos = html.match(/<video[^>]*>/g) ?? [];
        expect(videos).toHaveLength(clips.length);
        for (const video of videos) {
            expect(video).toContain('preload="none"');
            expect(video, "posters load near the screen, not with the page").not.toMatch(/poster=/);
            expect(video).not.toMatch(/autoplay/i);
            expect(video).toMatch(/aria-describedby="[a-z-]+-steps"/);
        }
    });
});
