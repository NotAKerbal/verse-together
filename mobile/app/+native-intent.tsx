import { appPathForSystemUrl } from "../src/navigation/appLinks";

/** Every URL that opens the app passes through here first: website links become app paths (src/navigation/appLinks.ts). */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return appPathForSystemUrl(path);
}
