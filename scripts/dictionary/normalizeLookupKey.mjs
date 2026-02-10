export function normalizeLookupKey(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateLookupCandidates(term) {
  const base = normalizeLookupKey(term);
  if (!base) return [];
  const out = new Set([base]);

  if (base.endsWith("ies")) out.add(`${base.slice(0, -3)}y`);
  if (/(sses|xes|zes|ches|shes)$/.test(base)) out.add(base.slice(0, -2));
  if (base.endsWith("s") && !base.endsWith("ss")) out.add(base.slice(0, -1));
  out.add(base.replace(/-/g, ""));

  return Array.from(out).filter(Boolean);
}
