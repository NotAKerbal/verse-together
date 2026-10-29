import { NextResponse } from "next/server";
import { androidAssetLinks, APP_SIGNING_ENV } from "@/lib/androidAppLinks";

// Read on each request, so setting the deployment's ANDROID_APP_SIGNING_CERT_SHA256 needs no rebuild of this file.
export const dynamic = "force-dynamic";

/**
 * Android's App Links verification file (src/lib/androidAppLinks.ts). Served only when the deployment names Google
 * Play's app signing certificate; otherwise a 404 that says what's missing, so Android doesn't verify and nothing
 * pretends it would.
 */
export function GET() {
  const result = androidAssetLinks(process.env[APP_SIGNING_ENV]);
  if (!result.ok) {
    console.error(`assetlinks.json not served: ${result.problem}`);
    return NextResponse.json({ error: "Android app links aren't configured on this deployment." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(result.statements, { headers: { "Cache-Control": "public, max-age=3600" } });
}
