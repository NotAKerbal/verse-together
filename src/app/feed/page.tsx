import NotesWorkspace from "@/components/NotesWorkspace";

export default function FeedPage() {
  return (
    <section className="page-shell-wide pb-8">
      <NotesWorkspace showTitleBelowSearch={true} />
    </section>
  );
}
