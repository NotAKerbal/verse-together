"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink } from "@fortawesome/free-solid-svg-icons";
import styles from "./featureGuide.module.css";
type Outcome = "copied" | "manual" | null;
export function sectionUrl(origin: string, sectionId: string) {
    return `${origin}/feature-guide#${sectionId}`;
}
export default function CopySectionLink({ sectionId, title }: {
    sectionId: string;
    title: string;
}) {
    const [outcome, setOutcome] = useState<Outcome>(null);
    const [url, setUrl] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const inputId = useId();
    useEffect(() => {
        if (outcome !== "copied")
            return;
        const timer = window.setTimeout(() => setOutcome(null), 2500);
        return () => window.clearTimeout(timer);
    }, [outcome]);
    useEffect(() => {
        if (outcome === "manual")
            inputRef.current?.select();
    }, [outcome]);
    async function copy() {
        const link = sectionUrl(window.location.origin, sectionId);
        setUrl(link);
        try {
            if (!navigator.clipboard)
                throw new Error("no clipboard");
            await navigator.clipboard.writeText(link);
            setOutcome("copied");
        }
        catch {
            setOutcome("manual");
        }
    }
    return (<div className={styles.copyLink}>
      <button type="button" className={styles.copyButton} onClick={() => void copy()} aria-label={`Copy a link to “${title}”`}>
        <FontAwesomeIcon icon={faLink} aria-hidden="true"/>
        Copy link
      </button>
      <span role="status" className={styles.copyStatus}>
        {outcome === "copied" ? "Link copied" : ""}
      </span>
      {outcome === "manual" ? (<span className={styles.manualCopy}>
          <label htmlFor={inputId}>Copy this link:</label>
          <input id={inputId} ref={inputRef} readOnly value={url} onFocus={(event) => event.currentTarget.select()}/>
        </span>) : null}
    </div>);
}
