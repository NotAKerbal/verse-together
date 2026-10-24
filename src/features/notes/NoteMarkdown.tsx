"use client";

import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import { isSafeSourceHref } from "./journal";

// Raw HTML in notes is never rendered (react-markdown escapes it unless a rehype-raw plugin is added, and none
// is). Links keep only same-app paths (the same rule as note sources, so "/\evil.example" is refused) and
// http(s)/mailto URLs; anything else is dropped to plain text.
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) return isSafeSourceHref(trimmed) ? trimmed : "";
  if (/[\u0000-\u001f\u007f-\u009f\s\\]/.test(trimmed)) return "";
  if (/^(https?:|mailto:)/i.test(trimmed)) return defaultUrlTransform(trimmed);
  return "";
}

const components: Components = {
  a({ href, children }) {
    if (!href) return <span>{children}</span>;
    if (isSafeSourceHref(href)) {
      return (
        <Link href={href} className="underline decoration-[color:var(--rule-strong)] underline-offset-2">
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline decoration-[color:var(--rule-strong)] underline-offset-2"
      >
        {children}
      </a>
    );
  },
  // Images in a note would load third-party content; show their alt text instead.
  img({ alt }) {
    return alt ? <span>[{alt}]</span> : null;
  },
};

export default function NoteMarkdown({ markdown, className = "" }: { markdown: string; className?: string }) {
  return (
    <div className={`note-markdown space-y-3 break-words font-serif text-[1.02rem] leading-relaxed ${className}`}>
      <ReactMarkdown urlTransform={safeUrl} components={components} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
