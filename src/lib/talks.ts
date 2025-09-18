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

  // Enhance links and footnotes
  bodyHtml = enhanceLinksAndFootnotes(bodyHtml);
  const enhancedAbout = aboutHtml ? enhanceLinksAndFootnotes(aboutHtml) : undefined;

  return {
    id,
    title,
    speaker,
    calling,
    session: sessionLine,
    aboutHtml: enhancedAbout,
    bodyHtml,
  };
}

// Convert bracket/superscript footnote refs into anchors and structure Notes section
function enhanceLinksAndFootnotes(inputHtml: string): string {
  let out = inputHtml;

  // Collect inline footnotes embedded inside <sup class="noteMarker"> ... <span class="footnote ...">[ ... ]</span></sup>
  const inlineNotes: Record<string, string> = {};
  out = out.replace(/<sup[^>]*class="[^"]*noteMarker[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, (supHtml) => {
    // Try to capture note number from href or inner text
    const hrefNum = supHtml.match(/href="#?note\s*-?(\d+)"/i)?.[1];
    const textNum = supHtml.match(/<a[^>]*>(\d+)<\/a>/i)?.[1] || supHtml.match(/>(\d+)</)?.[1];
    const num = hrefNum || textNum || "";

    // Extract inner footnote content
    const noteContentRaw = supHtml.match(/<span[^>]*class="[^"]*footnote[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "";
    const noteContent = noteContentRaw.replace(/^\s*\[|\]\s*$/g, "");
    if (num) inlineNotes[num] = noteContent;

    // Return a clean superscript anchor pointing to normalized id
    return num ? `<sup><a href="#note-${num}" class="footnote-ref">${num}</a></sup>` : supHtml;
  });

  // Ensure external links open in new tab with rel safety
  out = out.replace(/<a([^>]*?href=\"https?:[^\"]+\"[^>]*)>/gi, (m, attrs) => {
    let a = attrs;
    if (!/\btarget=/i.test(a)) a += ' target="_blank"';
    if (!/\brel=/i.test(a)) a += ' rel="noopener noreferrer"';
    return `<a${a}>`;
  });

  // Footnote references like <sup>[1]</sup> or <sup>1</sup>
  out = out.replace(/<sup[^>]*>\s*\[?(\d{1,3})\]?\s*<\/sup>/gi, (_m, n) => `<sup><a href="#note-${n}" class="footnote-ref">${n}</a></sup>`);

  // Occasionally footnote refs may be plain [1] without <sup>; linkify those cautiously when surrounded by non-word boundaries
  out = out.replace(/(\s)\[(\d{1,3})\](?=\s|[\.,;:])/g, (_m, sp, n) => `${sp}<sup><a href="#note-${n}" class="footnote-ref">${n}</a></sup>`);

  // Normalize any legacy anchors like href="#note1" to href="#note-1"
  out = out.replace(/href="#note(\d+)"/gi, 'href="#note-$1"');

  // Extract and remove BYU embedded footer notes if present
  let footerItems: string[] = [];
  const footerMatch = out.match(/<footer[^>]*class="[^"]*\bnotes\b[^"]*"[^>]*>[\s\S]*?<\/footer>/i);
  if (footerMatch) {
    const footerHtml = footerMatch[0];
    const liMatches = Array.from(footerHtml.matchAll(/<li[^>]*id="note(\d+)"[^>]*>[\s\S]*?<\/li>/gi));
    if (liMatches.length > 0) {
      // Prefer the note-p content if present; else take inner HTML
      for (const m of liMatches) {
        const num = m[1];
        const inner = m[0].match(/<span[^>]*class="[^"]*note-p[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]
          || m[0].match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
          || m[0].replace(/^<li[^>]*>|<\/li>$/g, "");
        footerItems.push(`<li id="note-${num}">${inner}</li>`);
      }
    } else {
      // Fallback: any <li> inside the footer
      const genericLis = Array.from(footerHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi));
      footerItems = genericLis.map((m, i) => `<li id="note-${i + 1}">${m[1]}</li>`);
    }
    // Remove the entire footer block from the output
    out = out.replace(footerMatch[0], "");
  }

  // Detect Notes section and restructure to an ordered list with anchors
  const notesMatch = out.match(/<h\d[^>]*>\s*Notes\s*<\/h\d>[\s\S]*/i);
  if (notesMatch) {
    const notesStart = notesMatch.index ?? -1;
    if (notesStart >= 0) {
      const trailing = out.slice(notesStart);
      const existingListItems = Array.from(trailing.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m, i) => `<li id="note-${i + 1}">${m[1]}</li>`);
      // Prefer footer items, else inlineNotes, else existing list or paragraph notes
      let items: string[] = [];
      if (footerItems.length > 0) {
        items = footerItems;
      } else if (Object.keys(inlineNotes).length > 0) {
        const nums = Object.keys(inlineNotes).map((n) => Number(n)).sort((a, b) => a - b);
        items = nums.map((n) => `<li id="note-${n}">${inlineNotes[String(n)]}</li>`);
      } else if (existingListItems.length > 0) {
        items = existingListItems;
      } else {
        const pMatches = Array.from(trailing.matchAll(/<p[^>]*>\s*(\d{1,3})\.\s*([\s\S]*?)<\/p>/gi));
        items = pMatches.map((pm) => `<li id="note-${pm[1]}">${pm[2]}</li>`);
      }
      if (items.length > 0) {
        out = out.slice(0, notesStart) + `<h2>Notes<\/h2><ol class=\"footnotes\">${items.join("")}</ol>`;
      }
    }
  }
  // If we collected inline notes but no Notes section existed, append one
  if (!/class=\"footnotes\"/.test(out) && (footerItems.length > 0 || Object.keys(inlineNotes).length > 0)) {
    const items = footerItems.length > 0
      ? footerItems
      : Object.keys(inlineNotes).map((n) => Number(n)).sort((a, b) => a - b).map((n) => `<li id=\"note-${n}\">${inlineNotes[String(n)]}</li>`);
    out += `<h2>Notes</h2><ol class=\"footnotes\">${items.join("")}</ol>`;
  }

  return out;
}


