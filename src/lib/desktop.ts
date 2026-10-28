// Tauri injects this API only into its webview. No desktop dependency is shipped to browsers.
type NativeChapter = {
  reference: string;
  translation?: string;
  verses: Array<{ verse: number; text: string }>;
};

type DesktopWindow = Window & {
  __TAURI__?: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } };
};

export async function readDesktopChapter(
  volume: string,
  book: string,
  chapter: number,
): Promise<NativeChapter | null> {
  if (typeof window === "undefined") return null;
  const core = (window as DesktopWindow).__TAURI__?.core;
  if (!core) return null;
  return core.invoke<NativeChapter | null>("read_scripture_chapter", { volume, book, chapter });
}
