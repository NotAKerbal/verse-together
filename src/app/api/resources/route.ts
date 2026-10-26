import { NextRequest, NextResponse } from "next/server";
import { getVerseLessonResources, parseResourceSelection } from "@/lib/cfm/verseResources";

export async function GET(request: NextRequest) {
  const selection = parseResourceSelection(request.nextUrl.searchParams);
  if (!selection) return NextResponse.json({ error: "Invalid scripture selection" }, { status: 400 });
  try {
    return NextResponse.json({ resources: getVerseLessonResources(selection) });
  } catch {
    return NextResponse.json({ error: "Unable to load lesson resources" }, { status: 500 });
  }
}
