import { useState } from "react";
import { createRoot } from "react-dom/client";
import VerseAnnotationEditor from "../../src/features/annotations/VerseAnnotationEditor";
import type { VerseAnnotation } from "../../src/features/annotations/verseAnnotations";
import VerseMarkedText from "../../src/features/annotations/VerseMarkedText";
import { FixtureMutations } from "./convex";
import "../../src/app/globals.css";

const verseText = "Wherefore she went forth out of the place where she was, and her two daughters in law with her; and they went on the way to return unto the land of Judah.";
const seed: VerseAnnotation = {
  id: "qa-verse-7", verse: 7, body: "", visibility: "private", highlight_color: "yellow",
  user_id: "synthetic-reader", is_mine: true,
  created_at: "2026-10-25T12:00:00.000Z", updated_at: "2026-10-25T12:00:00.000Z",
};

function App() {
  const [annotation, setAnnotation] = useState<VerseAnnotation | null>(seed);
  const [editing, setEditing] = useState(false);
  const [dark, setDark] = useState(false);
  const [footnoteOpen, setFootnoteOpen] = useState(false);
  return (
    <FixtureMutations
      save={async (args) => {
        setAnnotation({ ...seed, body: args.body.trim(), highlight_color: args.highlightColor ?? null,
          underline: args.underline ?? false,
          underline_color: args.underline ? args.underlineColor ?? "red" : null,
          updated_at: new Date().toISOString() });
      }}
      remove={async () => setAnnotation(null)}
    >
      <main className="mx-auto max-w-3xl p-6 text-foreground">
        <p className="text-sm text-foreground/60">Synthetic QA · actual annotation editor and marking styles · no backend writes</p>
        <h1 className="my-4 font-serif text-3xl">Ruth 1</h1>
        <div className="mb-6 flex flex-wrap gap-3">
          <button className="rounded border surface-button px-3 py-2" onClick={() => setEditing(true)}>Annotate verse 7</button>
          <button className="rounded border surface-button px-3 py-2" onClick={() => {
            document.documentElement.dataset.theme = dark ? "light" : "dark";
            setDark(!dark);
          }}>Toggle theme</button>
        </div>
        <ol className="font-serif text-xl leading-9">
          <li id="qa-verse" className="mb-6">
            <span className="verse-badge">7</span>
            <VerseMarkedText annotation={annotation}>
              {verseText.split(" ").map((word, index) => <span key={index} data-word-index={index}>{word}{index === 16 ? <button aria-label="Footnote" onClick={() => setFootnoteOpen(!footnoteOpen)}><sup>a</sup></button> : null}{" "}</span>)}
            </VerseMarkedText>
            {annotation?.body ? <div className="mt-2 rounded-md border surface-card-soft p-2 font-sans text-sm"><div>Your annotation</div>{annotation.body}</div> : null}
          </li>
          <li><span className="verse-badge">8</span>And Naomi said unto her two daughters in law, Go, return each to her mother’s house.</li>
        </ol>
        {footnoteOpen ? <p role="status">Synthetic footnote opened.</p> : null}
        <output id="saved-state" className="mt-8 block break-all font-mono text-xs">{JSON.stringify(annotation)}</output>
        {editing ? <VerseAnnotationEditor target={{ volume: "oldtestament", book: "ruth", chapter: 1, verse: 7 }} label="Ruth 1:7" rows={annotation ? [annotation] : []} loaded onClose={() => setEditing(false)} /> : null}
      </main>
    </FixtureMutations>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
