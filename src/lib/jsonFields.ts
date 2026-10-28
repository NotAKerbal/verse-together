/** Small field readers for untrusted scripture API responses. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function get(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

export function getString(obj: unknown, key: string): string | undefined {
  const value = get(obj, key);
  return typeof value === "string" ? value : undefined;
}

export function getNumber(obj: unknown, key: string): number | undefined {
  const value = get(obj, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

