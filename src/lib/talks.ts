export type TalkDetails = {
  id: string;
  title: string;
  speaker?: string;
  calling?: string;
  session?: string; // e.g., 2021–O:44
  aboutHtml?: string;
  bodyHtml: string;
};

const BASE = "https://scriptures.byu.edu";

export async function fetchTalkHtml(id: string): Promise<string> {
  const url = `${BASE}/content/talks_ajax/${encodeURIComponent(id)}/`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Talk load failed ${res.status}`);
  return await res.text();
}

function extractText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseTalkHtml(id: string, html: string): TalkDetails {
  // Session/speaker/title line usually near the top
  const headerMatch = html.match(/^(?:\s*|)\s*([\d\u2013\-OAC: ,A-Za-z\.\u00C0-\u024F]+?)<\/?/m);
  const sessionLine = headerMatch ? extractText(headerMatch[1]).trim() : undefined;

  // Title in <h1>
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? extractText(titleMatch[1]) : `Talk ${id}`;

  // Speaker line like "By Elder Name" optionally followed by calling line "Of the ..."
  const speakerMatch = html.match(/<h1[\s\S]*?<\/h1>[\s\S]*?<p[^>]*>\s*By\s+([\s\S]*?)<\/p>/i);
  const speaker = speakerMatch ? extractText(speakerMatch[1]) : undefined;
  const callingMatch = html.match(/<p[^>]*>\s*Of\s+the\s+([\s\S]*?)<\/p>/i);
  const calling = callingMatch ? extractText(callingMatch[1]) : undefined;

  // Optional About section
  const aboutSection = html.match(/<h2[^>]*>\s*About\s*<\/h2>[\s\S]*?(<p[\s\S]*?)<h1/i) || html.match(/<h2[^>]*>\s*About\s*<\/h2>[\s\S]*$/i);
  const aboutHtml = aboutSection ? aboutSection[1] : undefined;

  // Main body: capture from <h1> to end, excluding scripts
  const bodyStart = titleMatch ? (titleMatch.index ?? 0) : 0;
  let bodyHtml = html.slice(bodyStart);
  bodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, "");

  return {
    id,
    title,
    speaker,
    calling,
    session: sessionLine,
    aboutHtml,
    bodyHtml,
  };
}


