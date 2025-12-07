import Link from "next/link";
import MigrationNotice from "../components/MigrationNotice";
import FeedbackForm from "../components/FeedbackForm";

export default function Home() {
  return (
    <section className="py-12 sm:py-20 space-y-12">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Share scriptures. Bear testimony. Learn together.
        </h1>
        <p className="mt-4 text-base sm:text-lg text-foreground/80">
          Find and share your favorite verses, write insights, and bear testimony.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90"
            data-ripple
          >
            Start browsing
          </Link>
          <Link
            href="/feed"
            className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
          >
            View feed
          </Link>
        </div>
      </div>
      <MigrationNotice />
      <div className="mx-auto max-w-5xl">
        <div className="grid sm:grid-cols-2 gap-6">
          <FeatureCard
            title="Find relevant conference talks"
            description="Find talks that reference the verses you're studying and listen to them in Gospel Library."
          />
          <FeatureCard
            title="Scripture sharing with others"
            description="Highlight verses, add notes, and share with the community or friends."
          />
          <FeatureCard
            title="Verse Explorer"
            description="Jump across cross-references and footnotes to deepen your study."
          />
          <FeatureCard
            title="Reader settings"
            description="Customize font size, line width, and tools to fit your study style."
          />
        </div>
      </div>
      <div className="mx-auto max-w-3xl">
        <div className="mt-10">
          <FeedbackForm />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-foreground/80">{description}</p>
    </div>
  );
}
