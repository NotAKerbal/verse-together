import { NextRequest, NextResponse } from "next/server";
import { getServerConvexToken } from "@/lib/auth-server";
import { convexMutation } from "@/lib/convexHttp";
import { cleanFeedback, type CleanFeedback } from "../../../../convex/feedbackRules";

type FeedbackPayload = {
  message: string;
  contact?: string;
  path?: string;
};

export async function POST(req: NextRequest) {
  let feedback: CleanFeedback;
  try {
    const json = (await req.json()) as Partial<FeedbackPayload> | null;
    feedback = cleanFeedback({
      message: (json?.message || "").toString(),
      contact: (json?.contact || "").toString(),
      path: (json?.path || "").toString(),
    });
  } catch (err) {
    const message = err instanceof Error && err.message.startsWith("Feedback ") ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // Feedback may be anonymous; when signed in, Convex attributes it to the verified app user.
    const token = await getServerConvexToken();
    await convexMutation("feedback:submitFeedback", feedback, token ?? undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Feedback could not be saved" }, { status: 502 });
  }
}
