"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { STRONGS_LANG, scriptRuns, type StrongsLookup, type StrongsMatch } from "@/lib/strongsLexicon";
import { ExploreRow } from "@/components/ExploreSection";
import { ExternalIcon, ExternalLink, eyebrow, linkFocus, secondaryLink } from "@/components/WordStudyLinks";

const SHOWN_FIRST = 3;

function MixedScript({ text }: { text: string }) {
  return scriptRuns(text).map((run, index) =>
    run.script ? (
      <bdi key={index} lang={STRONGS_LANG[run.script].lang} dir={STRONGS_LANG[run.script].dir}>{run.text}</bdi>
    ) : (
      run.text
    )
  );
}

function bibleHubEntryUrl(id: string): string {
  return `https://biblehub.com/${id.startsWith("H") ? "hebrew" : "greek"}/${id.slice(1)}.htm`;
}

function LexiconEntry({ match }: { match: StrongsMatch }) {
  return (
    <div className="space-y-1.5">
      {match.pronunciation ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          <span className="sr-only">pronounced </span>{match.pronunciation}
        </p>
      ) : null}
      <p><MixedScript text={match.definition} /></p>
      {match.derivation ? (
        <p className="text-xs leading-5 text-[color:var(--foreground-muted)]"><MixedScript text={match.derivation} /></p>
      ) : null}
      <p className="text-xs leading-5">
        <span className="font-medium">KJV renders it: </span>
        <MixedScript text={match.kjv} />
      </p>
      <ExternalLink href={bibleHubEntryUrl(match.id)} className={secondaryLink}>
        {match.id} on Bible Hub
        <ExternalIcon />
      </ExternalLink>
    </div>
  );
}

export function LexiconResults({ lookup, furtherStudy }: { lookup: StrongsLookup; furtherStudy?: ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { matches, term, language } = lookup;
  const label = language === "hebrew" ? "Hebrew" : "Greek";
  const script = STRONGS_LANG[language];
  const shown = showAll ? matches : matches.slice(0, SHOWN_FIRST);
  const groups = [
    { id: "kjv", heading: `translated “${term}” in the KJV`, rows: shown.filter((match) => match.matchedIn === "kjv") },
    { id: "definition", heading: `definitions that mention “${term}”`, rows: shown.filter((match) => match.matchedIn === "definition") },
  ].filter((group) => group.rows.length > 0);

  return (
    <section aria-labelledby={`${listId}-language`} className="space-y-3 px-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h5 ref={headingRef} id={`${listId}-language`} className="scroll-mt-3 font-serif text-xl">{label}</h5>
        <span className="text-xs text-[color:var(--foreground-muted)]">{shown.length} of {matches.length} {matches.length === 1 ? "word" : "words"}</span>
      </div>
      {matches.length > 0 ? (
        <>
          <div id={listId} className="space-y-4">
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={`${listId}-${group.id}`} className="space-y-2">
                <h6 id={`${listId}-${group.id}`} className={eyebrow}>{group.heading}</h6>
                <ul className="m-0 list-none space-y-2 p-0 [&>li]:rounded-[11px] [&>li]:border [&>li]:border-[color:var(--explore-edge)]">
                  {group.rows.map((match) => (
                    <ExploreRow
                      key={match.id}
                      id={`${language}:${match.id}`}
                      label={<>{label} · <span className="sr-only">Strong’s number </span>{match.id}</>}
                      title={
                        <>
                          <bdi lang={script.lang} dir={script.dir} className="text-lg">{match.lemma}</bdi>
                          <span className="ml-1.5 text-[0.9375rem] italic text-[color:var(--foreground-muted)]">{match.transliteration}</span>
                        </>
                      }
                    >
                      <LexiconEntry match={match} />
                    </ExploreRow>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {matches.length > SHOWN_FIRST ? (
            <button
              type="button"
              aria-expanded={showAll}
              aria-controls={listId}
              onClick={() => {
                setShowAll((value) => !value);
                if (showAll) headingRef.current?.scrollIntoView({ block: "nearest" });
              }}
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[color:var(--explore-edge)] bg-[color:var(--explore-accent-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--explore-accent)] transition-colors hover:bg-[color:var(--explore-row-hover)] motion-reduce:transition-none ${linkFocus}`}
            >
              {showAll ? `Show fewer ${label} words` : `Show all ${matches.length} ${label} words`}
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${showAll ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : null}
        </>
      ) : (
        <p role="status" className="text-sm leading-6 text-[color:var(--foreground-muted)]">
          No {label} entry in Strong’s dictionary uses “{term}” in its King James renderings or definition.
        </p>
      )}
      <footer className="space-y-1 text-xs text-[color:var(--foreground-muted)]">
        {furtherStudy}
        <p className="text-[0.6875rem] leading-5">
          {lookup.attribution.title}, from{" "}
          <ExternalLink href={lookup.attribution.sourceUrl} className="underline underline-offset-2">OpenScriptures</ExternalLink>
          {" "}({lookup.attribution.license.replace(/\s*\(.*\)$/, "")})
        </p>
      </footer>
    </section>
  );
}
