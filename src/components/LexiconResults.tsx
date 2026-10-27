"use client";

import { useId, useState } from "react";
import { STRONGS_LANG, scriptRuns, type StrongsLookup, type StrongsMatch } from "@/lib/strongsLexicon";
import { ExploreRow, ExploreRows } from "@/components/ExploreSection";
import { ExternalIcon, ExternalLink, eyebrow, quietButton, secondaryLink } from "@/components/WordStudyLinks";

const SHOWN_FIRST = 3;

/** Text with each Hebrew or Greek run isolated in its own direction. */
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

/** A Strong's entry in full, under its title row: how it is said, what it means, and how the KJV renders it. */
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

/** A language's Strong's entries for the word as title rows: the best few, the rest on request, and the source. */
export function LexiconResults({ lookup }: { lookup: StrongsLookup }) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const { matches, term, language } = lookup;
  const label = language === "hebrew" ? "Hebrew" : "Greek";
  const script = STRONGS_LANG[language];
  const shown = showAll ? matches : matches.slice(0, SHOWN_FIRST);
  // Words the KJV translates as the term come first; words whose definitions only mention it follow, apart.
  const groups = [
    { id: "kjv", heading: `translated “${term}” in the KJV`, rows: shown.filter((match) => match.matchedIn === "kjv") },
    { id: "definition", heading: `definitions that mention “${term}”`, rows: shown.filter((match) => match.matchedIn === "definition") },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-1">
      {matches.length > 0 ? (
        <>
          <div id={listId} className="space-y-2">
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={`${listId}-${group.id}`}>
                <h6 id={`${listId}-${group.id}`} className={`px-2.5 pt-1 ${eyebrow}`}>{label} · {group.heading}</h6>
                <ExploreRows>
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
                </ExploreRows>
              </section>
            ))}
          </div>
          {matches.length > SHOWN_FIRST ? (
            <div className="px-2.5">
              <button type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((value) => !value)} className={quietButton}>
                {showAll ? "Show fewer" : `Show ${matches.length - SHOWN_FIRST} more`}
                <span className="sr-only"> {label} entries</span>
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p role="status" className="px-2.5 text-sm leading-6 text-[color:var(--foreground-muted)]">
          No {label} entry in Strong’s dictionary uses “{term}” in its King James renderings or definition.
        </p>
      )}
      <p className="px-2.5 text-xs leading-5 text-[color:var(--foreground-muted)]">
        {lookup.attribution.title}, from{" "}
        <ExternalLink href={lookup.attribution.sourceUrl} className="underline underline-offset-2">OpenScriptures</ExternalLink>
        {" "}({lookup.attribution.license.replace(/\s*\(.*\)$/, "")})
      </p>
    </div>
  );
}
