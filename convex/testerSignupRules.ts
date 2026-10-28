// Shared by the website and Convex so direct backend calls enforce the same limits.
export type TesterSignup = {
  name: string;
  email: string;
  android: boolean;
  ios: boolean;
  googlePlayEmail: string;
  device: string;
  consent: boolean;
};

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`Tester signup: ${label} is invalid.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max) throw new Error(`Tester signup: check ${label}.`);
  return cleaned;
}
function email(value: unknown, label: string): string {
  const cleaned = text(value, label, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) throw new Error(`Tester signup: enter a valid ${label}.`);
  return cleaned;
}
export function cleanTesterSignup(value: unknown): TesterSignup {
  if (!value || typeof value !== "object") throw new Error("Tester signup: invalid request.");
  const data = value as Record<string, unknown>;
  if (typeof data.android !== "boolean" || typeof data.ios !== "boolean" || (data.android === data.ios)) {
    throw new Error("Tester signup: choose Android or iOS.");
  }
  if (data.consent !== true) throw new Error("Tester signup: permission to contact you is required.");
  return {
    name: text(data.name, "name", 80, true),
    email: email(data.email, "contact email"),
    android: data.android,
    ios: data.ios,
    googlePlayEmail: data.android ? email(data.googlePlayEmail, "Google Play email") : "",
    device: text(data.device ?? "", "device details", 300),
    consent: true,
  };
}
