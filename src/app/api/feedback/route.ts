import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

    // If no service role key, let the client-side form handle RLS insertion.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: true, id: null });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("feedback")
      .insert({ message, contact, path })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, ok: true });
  } catch (_err) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}


