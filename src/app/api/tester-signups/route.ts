import { NextRequest, NextResponse } from "next/server";
import { ConvexError } from "convex/values";
import { convexMutation } from "@/lib/convexHttp";
import { cleanTesterSignup } from "../../../../convex/testerSignupRules";

export async function POST(req: NextRequest) {
  // Reject cross-origin browser submissions; this is a public form, not an authenticated operation.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  let signup;
  try {
    const body = await req.text();
    if (body.length > 4096) return NextResponse.json({ error: "Please shorten your response." }, { status: 413 });
    const data = JSON.parse(body);
    if (data?.website) return NextResponse.json({ ok: true }); // Honeypot; never store spam.
    signup = cleanTesterSignup(data);
  } catch (err) {
    const error = err instanceof Error && err.message.startsWith("Tester signup:") ? err.message : "Invalid signup. Please check your details.";
    return NextResponse.json({ error }, { status: 400 });
  }
  try {
    await convexMutation("testerSignups:submit", signup);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConvexError && typeof err.data === "object" && err.data?.code === "RATE_LIMITED") {
      return NextResponse.json({ error: "We’re receiving a lot of signups. Please try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    return NextResponse.json({ error: "Your signup couldn’t be saved. Please try again." }, { status: 502 });
  }
}
