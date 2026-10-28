/**
 * @jest-environment node
 *
 * The real services Explore and Translations read, checked only on request (plain Node fetch, real network):
 *   LIVE_NETWORK=1 npx jest __tests__/live-services.test.ts
 */
import { dictionaryBlocks } from "../src/features/explore/dictionaryText";
import { lookupDictionary, lookupLexicon, lookupStudyHelp, studyHelpBlocks } from "../src/features/explore/explore";
import { loadComparison, loadTranslations } from "../src/features/explore/translations";

const live = process.env.LIVE_NETWORK === "1" ? describe : describe.skip;

// The React Native Jest setup replaces fetch with a stub; these checks need the real network, so they get a
// minimal fetch over Node's https (GET only, which is all these services take).
function nodeFetch(url: string): Promise<Response> {
  const https = jest.requireActual<typeof import("https")>("https");
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: "application/json" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (name: string) => (res.headers[name.toLowerCase()] as string | undefined) ?? null },
            text: async () => text,
            json: async () => JSON.parse(text),
          } as unknown as Response);
        });
      })
      .on("error", reject);
  });
}

beforeAll(() => {
  global.fetch = nodeFetch as typeof fetch;
});

live("live services", () => {
  it("reads a dictionary entry and a study helps entry from Verse Together", async () => {
    const dictionary = await lookupDictionary("faith");
    expect(dictionary.ok).toBe(true);
    const entries = Object.values(dictionary.byEdition ?? {}).flatMap((edition) => edition?.entries ?? []);
    expect((dictionary.etymology?.items.length ?? 0) + entries.length).toBeGreaterThan(0);
    for (const item of entries) expect(dictionaryBlocks(item.entryText).length).toBeGreaterThan(0);
    const entry = await lookupStudyHelp("bd", "faith");
    expect(entry.title).toBe("Faith");
    expect(studyHelpBlocks(entry.blocks).length).toBeGreaterThan(0);
  });

  it("reads Strong's entries, and takes a whole phrase without cutting it to its first word", async () => {
    const hebrew = await lookupLexicon("hebrew", "faith");
    expect(hebrew).toMatchObject({ language: "hebrew", term: "faith" });
    expect(hebrew.matches.some((match) => match.id === "H530")).toBe(true);
    const phrase = await lookupLexicon("greek", "holy ghost");
    expect(phrase.term).toBe("holy ghost");
    const dictionary = await lookupDictionary("holy ghost");
    expect(dictionary).toMatchObject({ ok: true, term: "holy ghost" });
  });

  it("lists translations and reads a translated chapter from HelloAO", async () => {
    expect((await loadTranslations()).some((item) => item.id === "BSB")).toBe(true);
    const chapter = await loadComparison("genesis", 1, "BSB");
    expect(chapter.verses[0]).toMatchObject({ verse: 1, text: expect.stringContaining("beginning") });
  });
});
