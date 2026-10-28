"use server";

import { cookies } from "next/headers";
import { DEFAULT_BIBLE_COOKIE, normalizeDefaultBible } from "@/lib/defaultBible";

/** A cookie lets the server stream the chosen Bible without first rendering the wrong text. */
export async function saveDefaultBible(id: string): Promise<void> {
  (await cookies()).set(DEFAULT_BIBLE_COOKIE, normalizeDefaultBible(id), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
