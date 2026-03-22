import NotesWorkspace from "@/components/NotesWorkspace";

export default function FeedPage() {
  return (
    <section className="pb-8 space-y-3">
      <NotesWorkspace showTitleBelowSearch={true} />
    </section>
  );
}
