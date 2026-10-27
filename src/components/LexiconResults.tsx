"use client";

import { useId, useState } from "react";
import { STRONGS_LANG, scriptRuns, type StrongsLanguage, type StrongsLookup, type StrongsMatch } from "@/lib/strongsLexicon";
import { ExternalIcon, ExternalLink, quietButton, secondaryLink } from "@/components/WordStudyLinks";

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

function LexiconEntry({ match, language, term }: { match: StrongsMatch; language: StrongsLanguage; term: string }) {
  const script = STRONGS_LANG[language];
  return (
    <li className="space-y-1.5 rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <bdi lang={script.lang} dir={script.dir} className="font-serif text-2xl leading-tight">{match.lemma}</bdi>
        <span className="text-sm italic">{match.transliteration}</span>
        {match.pronunciation ? (
          <span className="text-xs text-[color:var(--foreground-muted)]">
            <span className="sr-only">pronounced </span>{match.pronunciation}
          </span>
        ) : null}
        <span className="ml-auto rounded-full border border-[color:var(--surface-border)] px-2 text-xs tabular-nums text-[color:var(--foreground-muted)]">
          <span className="sr-only">Strong’s number </span>{match.id}
        </span>
      </div>
      <p className="text-sm leading-6"><MixedScript text={match.definition} /></p>
      {match.derivation ? (
        <p className="text-xs leading-5 text-[color:var(--foreground-muted)]"><MixedScript text={match.derivation} /></p>
      ) : null}
      <p className="text-xs leading-5">
        <span className="font-medium">KJV renders it: </span>
        <MixedScript text={match.kjv} />
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {match.matchedIn === "definition" ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">Found in the definition, not the KJV renderings of “{term}”.</p>
        ) : <span />}
        <ExternalLink href={bibleHubEntryUrl(match.id)} className={secondaryLink}>
          {match.id} on Bible Hub
          <ExternalIcon />
        </ExternalLink>
      </div>
    </li>
  );
}

/** A language's Strong's entries for the word: the best few, the rest on request, and the source. */
export function LexiconResults({ lookup }: { lookup: StrongsLookup }) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const { matches, term, language } = lookup;
  const label = language === "hebrew" ? "Hebrew" : "Greek";
  const shown = showAll ? matches : matches.slice(0, SHOWN_FIRST);

  return (
    <div className="space-y-2">
      {matches.length > 0 ? (
        <>
          <p className="text-xs leading-5 text-[color:var(--foreground-muted)]">
            {label} words the King James Version translates as “{term}” (or whose definitions use it). They are
            possibilities to explore, not the word in this verse.
          </p>
          <ul id={listId} className="space-y-2">
            {shown.map((match) => <LexiconEntry key={match.id} match={match} language={language} term={term} />)}
          </ul>
          {matches.length > SHOWN_FIRST ? (
            <button type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((value) => !value)} className={quietButton}>
              {showAll ? "Show fewer" : `Show ${matches.length - SHOWN_FIRST} more`}
            </button>
          ) : null}
        </>
      ) : (
        <p role="status" className="text-sm leading-6 text-[color:var(--foreground-muted)]">
          No {label} entry in Strong’s dictionary uses “{term}” in its King James renderings or definition.
        </p>
      )}
      <p className="text-xs text-[color:var(--foreground-muted)]">
        {lookup.attribution.title}, from{" "}
        <ExternalLink href={lookup.attribution.sourceUrl} className="underline underline-offset-2">OpenScriptures</ExternalLink>
        {" "}({lookup.attribution.license.replace(/\s*\(.*\)$/, "")})
      </p>
    </div>
  );
}
