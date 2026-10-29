import fs from "fs";
import path from "path";
import renderIntentFilters from "@expo/config-plugins/build/android/IntentFilters";
import { ANDROID_PACKAGE } from "@/lib/androidAppLinks";
import { sharedPassagePath } from "../app/share/[volume]/[book]/[chapter]/[verses]";
import { redirectSystemPath } from "../app/+native-intent";
import { APP_LINK_HOST, APP_LINK_PATHS, appPathForSystemUrl, appPathForWebsiteUrl } from "../src/navigation/appLinks";
import { webUrl } from "../src/navigation/hrefs";

const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../app.json"), "utf8")).expo;
const site = (p: string) => `https://www.versetogether.org${p}`;

describe("Android app link intent filter (app.json)", () => {
  const filters = app.android.intentFilters as { autoVerify?: boolean; data: Record<string, string>[] }[];

  it("is for the app's package and the website host the app shares links to", () => {
    expect(app.android.package).toBe(ANDROID_PACKAGE);
    expect(APP_LINK_HOST).toBe("www.versetogether.org");
    expect(new URL(webUrl("/")).host).toBe(APP_LINK_HOST);
  });

  it("auto-verifies only https links to the library and shared passages on that host", () => {
    const verified = filters.filter((filter) => filter.autoVerify);
    expect(verified).toHaveLength(1);
    // Every verified host needs its own assetlinks.json; the apex redirects to www, so only www is listed.
    for (const data of verified[0].data) {
      expect(data.scheme).toBe("https");
      expect(data.host).toBe(APP_LINK_HOST);
      expect(Object.keys(data).sort()).toEqual(expect.arrayContaining(["host", "scheme"]));
      expect(data.pathPattern).toBeUndefined();
    }
    const exact = verified[0].data.filter((data) => data.path).map((data) => data.path);
    const prefixes = verified[0].data.filter((data) => data.pathPrefix).map((data) => data.pathPrefix);
    expect(exact).toEqual([...APP_LINK_PATHS.exact]);
    expect(prefixes).toEqual([...APP_LINK_PATHS.prefixes]);
    // No other https filter claims the site.
    expect(filters.filter((filter) => filter.data.some((data) => data.scheme?.startsWith("http")))).toHaveLength(1);
  });

  it("renders to an autoVerify VIEW/BROWSABLE/DEFAULT manifest filter", () => {
    const [rendered] = renderIntentFilters(filters as never);
    expect(rendered.$?.["android:autoVerify"]).toBe("true");
    expect(rendered.action!.map((action) => action.$["android:name"])).toEqual(["android.intent.action.VIEW"]);
    expect(rendered.category!.map((category) => category.$["android:name"]).sort()).toEqual([
      "android.intent.category.BROWSABLE",
      "android.intent.category.DEFAULT",
    ]);
    expect(rendered.data!.map((data) => data.$)).toEqual([
      { "android:scheme": "https", "android:host": "www.versetogether.org", "android:path": "/browse" },
      { "android:scheme": "https", "android:host": "www.versetogether.org", "android:pathPrefix": "/browse/" },
      { "android:scheme": "https", "android:host": "www.versetogether.org", "android:pathPrefix": "/share/" },
    ]);
  });

  it("keeps the app scheme Google sign-in returns to", () => {
    expect(app.scheme).toBe("versetogether");
  });
});

describe("website links opened in the app", () => {
  it("opens shared passages at the share route, which checks the passage", () => {
    expect(appPathForSystemUrl(site("/share/bookofmormon/alma/32/21-28"))).toBe("/share/bookofmormon/alma/32/21-28");
    expect(appPathForSystemUrl(site("/share/dnc/doctrineandcovenants/4/2-4/"))).toBe("/share/dnc/doctrineandcovenants/4/2-4");
    // The web's forgiving specs survive, encoded as one path segment.
    const mapped = appPathForSystemUrl(site("/share/bookofmormon/alma/32/27,%2021%E2%80%9323"));
    expect(mapped).toBe("/share/bookofmormon/alma/32/27%2C%2021%E2%80%9323");
    const verses = decodeURIComponent(mapped.split("/").pop()!);
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "32", verses })).toBe(
      "/browse/bookofmormon/alma/32?verse=21&verses=21-23%2C27",
    );
    // A well-formed link to a passage that doesn't exist still reaches the share route, which says so.
    expect(appPathForSystemUrl(site("/share/bookofmormon/alma/99/1"))).toBe("/share/bookofmormon/alma/99/1");
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "99", verses: "1" })).toBeNull();
  });

  it("opens browse links at the same screen, keeping only the reader's parameters", () => {
    expect(appPathForSystemUrl(site("/browse"))).toBe("/browse");
    expect(appPathForSystemUrl(site("/browse/"))).toBe("/browse");
    expect(appPathForSystemUrl(site("/browse/bookofmormon"))).toBe("/browse/bookofmormon");
    expect(appPathForSystemUrl(site("/browse/doctrineandcovenants"))).toBe("/browse/dnc");
    expect(appPathForSystemUrl(site("/browse/old-testament/genesis"))).toBe("/browse/oldtestament/genesis");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/32"))).toBe("/browse/bookofmormon/alma/32");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/32#v-21"))).toBe("/browse/bookofmormon/alma/32?verse=21");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/32#v-99"))).toBe("/browse/bookofmormon/alma/32");
    expect(appPathForSystemUrl(site("/browse/newtestament/john/3?translation=KJV&compare=BSB&utm_source=x&verse=9#v-16"))).toBe(
      "/browse/newtestament/john/3?verse=16&translation=KJV&compare=BSB",
    );
    expect(appPathForSystemUrl(site("/browse/newtestament/john/3?translation=..%2F..%2Fsettings&compare=%3Cb%3E"))).toBe("/browse/newtestament/john/3");
  });

  it("opens the nearest real screen for browse links to what the library doesn't have", () => {
    expect(appPathForSystemUrl(site("/browse/nope"))).toBe("/browse");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/nope/1"))).toBe("/browse/bookofmormon");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/99"))).toBe("/browse/bookofmormon/alma");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/032"))).toBe("/browse/bookofmormon/alma");
    expect(appPathForSystemUrl(site("/browse/bookofmormon/alma/32/extra"))).toBe("/browse/bookofmormon/alma/32");
    expect(appPathForSystemUrl(site("/browse/BookOfMormon"))).toBe("/browse");
  });

  it("opens the library for malformed or unexpected paths on the site", () => {
    for (const p of [
      "/share/bookofmormon/alma/32",
      "/share/bookofmormon/alma/32/21/extra",
      "/share/bookofmormon/alma/x/21",
      "/share/bookofmormon/al%2Fma/32/21",
      "/share/bookofmormon/alma/32/21%2F..%2Fsettings",
      "/share/bookofmormon/alma/32/%E0%A4%A",
      "/share/bookofmormon/../settings/32/1",
      "/browse//alma",
      "/settings",
      "/notes",
      "",
      "/",
    ]) {
      expect(appPathForSystemUrl(site(p))).toBe("/browse");
    }
  });

  it("opens the home screen, never the named path, for links to other hosts or over http", () => {
    for (const url of [
      "https://versetogether.org/share/bookofmormon/alma/32/21",
      "http://www.versetogether.org/share/bookofmormon/alma/32/21",
      "https://www.versetogether.org.evil.example/settings",
      "https://evil.example/settings",
      "https://user@www.versetogether.org/settings",
      "https://www.versetogether.org:8443/settings",
      "https://preview.versetogether.org/browse/bookofmormon",
      "https:www.versetogether.org/settings",
    ]) {
      expect(appPathForSystemUrl(url)).toBe("/");
      expect(appPathForWebsiteUrl(url)).toBeNull();
    }
    // Host names are case-insensitive.
    expect(appPathForSystemUrl("HTTPS://WWW.VerseTogether.org/browse/bookofmormon")).toBe("/browse/bookofmormon");
  });

  it("passes the app's own scheme (Google sign-in's return) and in-app paths through unchanged", () => {
    const signIn = "versetogether://auth-callback?attempt=a1&code=c2";
    expect(appPathForSystemUrl(signIn)).toBe(signIn);
    expect(redirectSystemPath({ path: signIn, initial: true })).toBe(signIn);
    expect(appPathForSystemUrl("versetogether://share/bookofmormon/alma/32/21")).toBe("versetogether://share/bookofmormon/alma/32/21");
    expect(appPathForSystemUrl("/browse/bookofmormon/alma/32?verse=21")).toBe("/browse/bookofmormon/alma/32?verse=21");
    expect(redirectSystemPath({ path: site("/share/bookofmormon/alma/32/21"), initial: false })).toBe("/share/bookofmormon/alma/32/21");
  });

  it("maps every link the app shares back to its screen", () => {
    expect(appPathForSystemUrl(webUrl("/share/bookofmormon/alma/32/21"))).toBe("/share/bookofmormon/alma/32/21");
    expect(appPathForSystemUrl(webUrl("/browse/dnc/doctrineandcovenants/4"))).toBe("/browse/dnc/doctrineandcovenants/4");
  });
});

describe("app routes the links resolve to", () => {
  it("exist", () => {
    const appDir = path.join(__dirname, "../app");
    for (const file of [
      "+native-intent.tsx",
      "(tabs)/browse/index.tsx",
      "(tabs)/browse/[volume]/index.tsx",
      "(tabs)/browse/[volume]/[book]/index.tsx",
      "(tabs)/browse/[volume]/[book]/[chapter].tsx",
      "share/[volume]/[book]/[chapter]/[verses].tsx",
    ]) {
      expect(fs.existsSync(path.join(appDir, file))).toBe(true);
    }
  });
});
