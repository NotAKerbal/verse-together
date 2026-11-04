"use client";

import { memo } from "react";
import { passageFromLink } from "@/features/comeFollowMe/passagePreview";
import type { VerseLessonResource } from "@/lib/cfm/verseResources";
import styles from "./VerseResourcesPanel.module.css";

const ResourceInsight = memo(function ResourceInsight({ html }: { html: string }) {
  return <div className={styles.insight} dangerouslySetInnerHTML={{ __html: html }} />;
});

export default function VerseResourceItem({ resource, previewsPassages }: { resource: VerseLessonResource; previewsPassages: boolean }) {
  return (
    <li className={styles.resource} data-generated={resource.generated ? "true" : undefined}>
      <p className={styles.reference}>{resource.reference}</p>
      <h2 className={styles.resourceTitle}><a href={resource.href}>{resource.title}</a></h2>
      <p className={styles.lesson}>{resource.dateLabel ? `${resource.lessonTitle} · ${resource.dateLabel}` : resource.lessonTitle}</p>
      {resource.bodyHtml ? <ResourceInsight html={resource.bodyHtml} /> : null}
      <a className={styles.link} href={resource.href}>{resource.linkLabel ?? "Read in lesson"} <span aria-hidden="true">→</span></a>
      {resource.sources.length > 0 ? (
        <div className={styles.sources}>
          <h3>Cited in this section</h3>
          <ul>
            {resource.sources.map((source) => (
              <li key={source.url}>
                {previewsPassages && passageFromLink(source.url, null, undefined, source.title)
                  ? <a href={source.url} className={styles.passageSource}>{source.title}</a>
                  : <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-label="opens in a new tab">↗</span></a>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
