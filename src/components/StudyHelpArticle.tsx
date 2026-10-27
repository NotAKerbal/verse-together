"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { previewStudyHelpBlocks, type StudyHelpBlock, type StudyHelpEntry, type StudyHelpInline } from "@/lib/studyHelpContent";
import type { StudyHelpGuideId } from "@/lib/studyHelps";
import { ExternalIcon, ExternalLink, quietButton, secondaryLink, textLink } from "@/components/WordStudyLinks";

type SelectTopic = (slug: string) => void;
type InlineContext = { guide: StudyHelpGuideId; onSelectTopic?: SelectTopic };

function InlineNodes({ nodes, context }: { nodes: StudyHelpInline[]; context: InlineContext }) {
  return nodes.map((node, index) => <InlineNode key={index} node={node} context={context} />);
}

function InlineNode({ node, context }: { node: StudyHelpInline; context: InlineContext }): ReactNode {
  if (typeof node === "string") return node;
  const children = <InlineNodes nodes={node.children} context={context} />;
  if ("mark" in node) {
    if (node.mark === "em") return <em>{children}</em>;
    if (node.mark === "strong") return <strong>{children}</strong>;
    if (node.mark === "small") return <small className="text-[0.85em]">{children}</small>;
    // The Topical Guide's keyword in each quoted phrase.
    return <b className="font-semibold">{children}</b>;
  }
  // Another entry of this guide opens here, in place of this one.
  if (node.topic && node.topic.guide === context.guide && context.onSelectTopic) {
    const { slug } = node.topic;
    const onSelectTopic = context.onSelectTopic;
    return (
      <button type="button" onClick={() => onSelectTopic(slug)} className={`${textLink} inline text-left`}>
        {children}
      </button>
    );
  }
  if (node.appHref) {
    return (
      <Link href={node.appHref} className={textLink}>
        {children}
      </Link>
    );
  }
  return (
    <ExternalLink href={node.href} className={textLink}>
      {children}
    </ExternalLink>
  );
}

function Blocks({ blocks, context }: { blocks: StudyHelpBlock[]; context: InlineContext }) {
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      return <p key={index} className="pt-1 text-sm font-semibold"><InlineNodes nodes={block.content} context={context} /></p>;
    }
    if (block.type === "list") {
      return (
        <ul key={index} className="space-y-1 border-l-2 border-[color:var(--surface-border)] pl-3">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}><InlineNodes nodes={item} context={context} /></li>
          ))}
        </ul>
      );
    }
    return (
      <p key={index} className={block.style === "title" ? "text-xs leading-5 text-[color:var(--foreground-muted)]" : undefined}>
        <InlineNodes nodes={block.content} context={context} />
      </p>
    );
  });
}

/** An entry's text, under the row that names it: a short preview, then all of it on "Read more". Links to the official page for the rest. */
export function StudyHelpArticle({ entry, guideLabel, onSelectTopic }: {
  entry: StudyHelpEntry;
  guideLabel: string;
  onSelectTopic?: SelectTopic;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const preview = previewStudyHelpBlocks(entry.blocks);
  const context: InlineContext = { guide: entry.guide, onSelectTopic };

  return (
    <div className="space-y-2">
      <div id={bodyId} className="space-y-2 text-sm leading-6">
        <Blocks blocks={expanded ? entry.blocks : preview.blocks} context={context} />
        {expanded && entry.truncated ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">This entry continues at its source.</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {preview.hasMore ? (
          <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((value) => !value)} className={quietButton}>
            {expanded ? "Show less" : "Read more"}
            <span className="sr-only"> of {entry.title}</span>
          </button>
        ) : <span />}
        <ExternalLink href={entry.url} className={secondaryLink}>
          Read at source<span className="sr-only">: {entry.title}, {guideLabel}</span>
          <ExternalIcon />
        </ExternalLink>
      </div>
    </div>
  );
}
