"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import styles from "@/app/account/page.module.css";
import ReaderAppearanceControls from "@/components/ReaderAppearanceControls";
import { getDefaultAppearance, isDefaultAppearance } from "@/lib/preferences";
import { useReaderPreferences } from "@/lib/useReaderPreferences";
import { useSimpleMode } from "@/lib/simpleMode";

// Public-domain King James text.
const SAMPLE_VERSES = [
  { verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
  { verse: 2, text: "The same was in the beginning with God." },
  { verse: 3, text: "All things were made by him; and without him was not any thing made that was made." },
];

const TEXT_WIDTH_LABELS = { comfortable: "Comfortable", wide: "Wide", full: "Full" } as const;

/** How scripture looks in the reader: the same preferences, saved the same way, as Reader settings. */
export default function ReadingSettings() {
  const { prefs, loaded, update, syncsToAccount } = useReaderPreferences();
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const atDefaults = isDefaultAppearance(prefs);

  return (
    <div className={styles.readingGrid}>
      <figure className={`${styles.settingsCard} ${styles.sample}`} aria-labelledby="reading-sample-caption">
        <figcaption id="reading-sample-caption" className={styles.sampleCaption}>
          <span>Preview · John 1:1–3</span>
          <span>
            {Math.round(prefs.fontScale * 100)}% · {prefs.fontFamily === "sans" ? "Sans" : "Serif"} ·{" "}
            {TEXT_WIDTH_LABELS[prefs.textWidth]} width
          </span>
        </figcaption>
        <div
          className={`reader-verses ${styles.sampleText} ${prefs.fontFamily === "sans" ? "font-sans" : "font-serif"}`}
          style={{ fontSize: `${prefs.fontScale}rem` }}
          aria-busy={!loaded || undefined}
        >
          {SAMPLE_VERSES.map((verse) => (
            <p key={verse.verse} className="reader-verse leading-7 px-3 py-2 -mx-2">
              <span className="verse-badge">{verse.verse}</span>
              {verse.text}
            </p>
          ))}
        </div>
      </figure>

      <section className={styles.settingsCard} aria-labelledby="reading-appearance-title">
        <div className={styles.preferences}>
          <div className={styles.cardHeader}>
            <div>
              <h3 id="reading-appearance-title" className={styles.settingTitle}>
                Scripture appearance
              </h3>
              <p>{syncsToAccount ? "Your account" : "This device"} · Also in Reader settings</p>
            </div>
            <button
              type="button"
              className={styles.quickMarkTextButton}
              aria-label="Reset scripture appearance"
              aria-disabled={atDefaults || undefined}
              onClick={() => {
                if (!atDefaults) update({ ...prefs, ...getDefaultAppearance() });
              }}
            >
              <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" className="h-3 w-3" />
              Reset
            </button>
          </div>
          <ReaderAppearanceControls prefs={prefs} onChange={update} showDescriptions />
        </div>
      </section>

      <section className={styles.settingsCard} aria-labelledby="simple-mode-setting-title">
        <div className={styles.preferences}>
          <div className={styles.setting}>
            <div>
              <h3 id="simple-mode-setting-title" className={styles.settingTitle}>
                Simple mode
              </h3>
              <p aria-live="polite">{simpleMode ? "Study tools hidden" : "Study tools visible"} · This device</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={simpleMode}
              aria-label="Simple mode"
              className={styles.toggle}
              onClick={() => setSimpleMode(!simpleMode)}
            >
              <span>
                <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
