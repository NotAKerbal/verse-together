"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useSimpleMode } from "@/lib/simpleMode";

/** Always-available way out of simple mode; CSS shows it only while simple mode is on. */
export default function SimpleModeExitPill() {
  const [, setSimpleMode] = useSimpleMode();

  return (
    <button
      type="button"
      className="simple-only simple-exit-pill"
      onClick={() => setSimpleMode(false)}
      aria-label="Exit simple mode"
    >
      <FontAwesomeIcon icon={faEyeSlash} className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Exit simple mode</span>
    </button>
  );
}
