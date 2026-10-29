"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "@/app/account/page.module.css";
import {
  CURRENT_VERSION,
  formatReleaseDate,
  RELEASES,
  UNRELEASED,
  type Release,
  type ReleaseNoteItem,
  type ReleaseScreenshot,
} from "@/lib/releaseNotes";

/** How many releases show before "Earlier releases". */
const RECENT_COUNT = 3;

const KIND_LABELS = { new: "New", improved: "Improved" } as const;

function releaseDates(release: Release) {
  if (!release.since) return <time dateTime={release.date}>{formatReleaseDate(release.date)}</time>;
  return (
    <>
      <time dateTime={release.since}>{formatReleaseDate(release.since)}</time> –{" "}
      <time dateTime={release.date}>{formatReleaseDate(release.date)}</time>
    </>
  );
}

function Screenshot({ shot, onOpen }: { shot: ReleaseScreenshot; onOpen: (shot: ReleaseScreenshot) => void }) {
  return (
    <figure className={styles.releaseFigure}>
      <button type="button" className={styles.releaseShot} aria-haspopup="dialog" onClick={() => onOpen(shot)}>
        {/* Static, pre-sized WebP screenshots under public/release-notes; next/image adds nothing they need. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.src} width={shot.width} height={shot.height} alt={shot.alt} loading="lazy" decoding="async" />
        <span className="sr-only"> (view larger)</span>
      </button>
      <figcaption>
        {shot.caption}
        {shot.currentInterface ? <span className={styles.releaseShotNote}> Shown in today&apos;s interface.</span> : null}
      </figcaption>
    </figure>
  );
}

function Items({ items, onOpen }: { items: ReleaseNoteItem[]; onOpen: (shot: ReleaseScreenshot) => void }) {
  return (
    <ul className={styles.releaseItems}>
      {items.map((item) => (
        <li key={item.text}>
          <span className={styles.releaseKind} data-kind={item.kind}>
            {KIND_LABELS[item.kind]}
          </span>
          <div className={styles.releaseItemBody}>
            <span>{item.text}</span>
            {item.screenshot ? <Screenshot shot={item.screenshot} onOpen={onOpen} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReleaseHeading({ titleId, title, version, date }: {
  titleId: string;
  title: string;
  version: ReactNode;
  date: ReactNode;
}) {
  return (
    <header className={styles.releaseHeader}>
      <p className={styles.releaseMeta}>
        <span className={styles.releaseVersion}>{version}</span>
        <span aria-hidden="true">·</span>
        <span>{date}</span>
      </p>
      <h3 id={titleId}>{title}</h3>
    </header>
  );
}

function Entry({ release, onOpen }: { release: Release; onOpen: (shot: ReleaseScreenshot) => void }) {
  const titleId = `release-${release.version}`;
  return (
    <li className={styles.releaseEntry}>
      <article aria-labelledby={titleId}>
        <ReleaseHeading
          titleId={titleId}
          title={release.title}
          version={<>Version {release.version}</>}
          date={releaseDates(release)}
        />
        <Items items={release.items} onOpen={onOpen} />
      </article>
    </li>
  );
}

/** A screenshot at full size, in a modal dialog that closes with Escape, its button or a click outside. */
function ScreenshotViewer({ shot, onClose }: { shot: ReleaseScreenshot | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shot && !dialog.open) dialog.showModal();
    if (!shot && dialog.open) dialog.close();
  }, [shot]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.releaseViewer}
      aria-label={shot ? shot.caption : "Screenshot"}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {shot ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.src} width={shot.width} height={shot.height} alt={shot.alt} decoding="async" />
          <figcaption>{shot.caption}</figcaption>
        </figure>
      ) : null}
      <button type="button" className={styles.releaseViewerClose} onClick={onClose} aria-label="Close screenshot">
        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
      </button>
    </dialog>
  );
}

export default function ReleaseNotes() {
  const [viewing, setViewing] = useState<ReleaseScreenshot | null>(null);
  const recent = RELEASES.slice(0, RECENT_COUNT);
  const earlier = RELEASES.slice(RECENT_COUNT);

  return (
    <div className={styles.releaseNotes}>
      <p className={styles.releaseCurrent}>
        You&apos;re using <strong>Verse Together {CURRENT_VERSION}</strong>, released{" "}
        {formatReleaseDate(RELEASES[0].date)}.
      </p>

      {UNRELEASED.items.length > 0 ? (
        <section className={`${styles.releaseEntry} ${styles.releaseUpcoming}`} aria-labelledby="release-unreleased">
          <ReleaseHeading
            titleId="release-unreleased"
            title={UNRELEASED.title}
            version="Unreleased"
            date="In development, coming in the next version"
          />
          <Items items={UNRELEASED.items} onOpen={setViewing} />
        </section>
      ) : null}

      <ol className={styles.releaseList}>
        {recent.map((release) => (
          <Entry key={release.version} release={release} onOpen={setViewing} />
        ))}
      </ol>
      {earlier.length > 0 ? (
        <details className={styles.releaseEarlier}>
          <summary className={styles.sectionSummary}>
            <span>Earlier releases</span>
            <span className={styles.sectionMeta}>
              {earlier[earlier.length - 1].version}–{earlier[0].version}
            </span>
          </summary>
          <ol className={styles.releaseList}>
            {earlier.map((release) => (
              <Entry key={release.version} release={release} onOpen={setViewing} />
            ))}
          </ol>
        </details>
      ) : null}

      <ScreenshotViewer shot={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
