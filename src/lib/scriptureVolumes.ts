const VOLUME_ALIAS_MAP: Record<string, string> = {
  dnc: "doctrineandcovenants",
  "old-testament": "oldtestament",
  "new-testament": "newtestament",
};

const VOLUME_SHORT_SLUG_MAP: Record<string, string> = {
  doctrineandcovenants: "dnc",
};

const VOLUME_LABEL_MAP: Record<string, string> = {
  bookofmormon: "Book of Mormon",
  oldtestament: "Old Testament",
  newtestament: "New Testament",
  doctrineandcovenants: "Doctrine and Covenants",
  pearl: "Pearl of Great Price",
};

export function normalizeScriptureVolume(volume: string): string {
  return VOLUME_ALIAS_MAP[volume] ?? volume;
}

export function toScriptureVolumeUrlSlug(volume: string): string {
  const canonical = normalizeScriptureVolume(volume);
  return VOLUME_SHORT_SLUG_MAP[canonical] ?? canonical;
}

export function getScriptureVolumeLabel(volume: string): string {
  const canonical = normalizeScriptureVolume(volume);
  return VOLUME_LABEL_MAP[canonical] ?? canonical.replace(/-/g, " ");
}
