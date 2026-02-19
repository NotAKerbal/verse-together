import NotesWorkspace from "@/components/NotesWorkspace";

export default function FeedPage() {
  return (
    <section className="-mt-6 sm:-mt-6 pb-8 space-y-3">
      <NotesWorkspace showTitleBelowSearch={true} />
    </section>
  );
}
