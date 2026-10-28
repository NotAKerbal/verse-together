// Public-path images ("/art/browse-notes.webp", as the web modules name them) as bundled native assets.

import { PUBLIC_IMAGES } from "../generated/images";

export function publicImage(src: string): number | null {
  return PUBLIC_IMAGES[src.replace(/^\//, "")] ?? null;
}
