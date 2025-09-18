import ReferencePicker from "../../../../components/ReferencePicker";
import Link from "next/link";

export default function BookLanding({ params }: { params: { volume: string; book: string } }) {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold capitalize">{params.book.replace(/-/g, " ")}</h1>
        <p className="text-foreground/80">Pick a chapter or use the reference picker.</p>
      </header>
      <div>
        <ReferencePicker />
      </div>
      <div>
        <Link
          href={`/browse/${params.volume}/${params.book}/1`}
          className="text-sm underline underline-offset-4"
        >
          Go to chapter 1
        </Link>
      </div>
    </section>
  );
}


