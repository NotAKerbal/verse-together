import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { convexMutation } from "@/lib/convexHttp";

type FeedbackPayload = {
  message: string;
  contact?: string;
  path?: string;
};

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json()) as Partial<FeedbackPayload> | null;
    const message = (json?.message || "").toString().trim();
    const contact = (json?.contact || "").toString().trim() || null;
    const path = (json?.path || "").toString().trim() || null;

    if (!message || message.length < 5) {
      return NextResponse.json({ error: "Feedback message is too short" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "Feedback message is too long" }, { status: 400 });
    }

    const { getToken } = await auth();
    const token = await getToken({ template: "convex" });
    await convexMutation(
      "feedback:submitFeedback",
      { message, contact: contact ?? undefined, path: path ?? undefined },
      token ?? undefined
    );
    return NextResponse.json({ ok: true });
  } catch (_err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}


