// Android backup rules with sign-in: the study stays in Android's default backup; only the secure-store file (the
// session, encrypted with a Keystore key that is never backed up) is left out.
import appJson from "../app.json";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("../plugins/withBackupRules") as {
  applyBackupRules: (manifest: { manifest: { application: Array<{ $: Record<string, string> }> } }) => { manifest: { application: Array<{ $: Record<string, string> }> } };
  backupRulesXml: string;
  extractionRulesXml: string;
};

describe("withBackupRules", () => {
  it("excludes only expo-secure-store's file, so files/SQLite (the study) is still backed up", () => {
    for (const xml of [plugin.backupRulesXml, plugin.extractionRulesXml]) {
      expect(xml).not.toContain("<include");
      expect(xml.match(/<exclude [^>]*>/g)?.every((rule) => rule === '<exclude domain="sharedpref" path="SecureStore.xml"/>')).toBe(true);
    }
    expect(plugin.extractionRulesXml).toContain("<cloud-backup>");
    expect(plugin.extractionRulesXml).toContain("<device-transfer>");
  });

  it("points the manifest at those rules", () => {
    const manifest = plugin.applyBackupRules({ manifest: { application: [{ $: { "android:allowBackup": "true" } }] } });
    expect(manifest.manifest.application[0].$).toEqual({
      "android:allowBackup": "true",
      "android:fullBackupContent": "@xml/verse_backup_rules",
      "android:dataExtractionRules": "@xml/verse_data_extraction_rules",
    });
  });

  it("is registered, with expo-secure-store's include-only rules switched off and no new permission", () => {
    const plugins = appJson.expo.plugins as unknown[];
    expect(plugins).toContain("./plugins/withBackupRules");
    expect(plugins).toContainEqual(["expo-secure-store", { configureAndroidBackup: false }]);
    expect(appJson.expo.android.allowBackup).toBe(true);
    // expo-network (Better Auth's online state) declares it; only ACCESS_NETWORK_STATE is needed.
    expect(appJson.expo.android.blockedPermissions).toContain("android.permission.ACCESS_WIFI_STATE");
  });
});
