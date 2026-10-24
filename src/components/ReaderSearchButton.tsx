"use client";

import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import LibrarySearch from "./LibrarySearch";

/**
 * The chapter header's search: a button that opens the Library's search (references jump to a chapter, anything
 * else searches every scripture) under the header, right-aligned with it. The panel is positioned against the
 * nearest positioned ancestor (the header pill), so it lines up with the pill's right edge and stays on screen.
 * The volume and book selection header uses it too, styled to match its own buttons.
 */
export default function ReaderSearchButton({
  buttonClassName = "reader-toolbar-button",
}: {
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="reader-search">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Search scriptures"
        title="Search scriptures or jump to a reference"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label="Search scriptures" className="reader-search-panel">
          <LibrarySearch variant="header" autoFocus onClose={close} />
        </div>
      ) : null}
    </div>
  );
}
