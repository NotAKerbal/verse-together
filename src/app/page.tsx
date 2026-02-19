import Link from "next/link";
import FeedbackForm from "../components/FeedbackForm";

export default function Home() {
  return (
    <div className="space-y-16 sm:space-y-24 py-12 sm:py-20">
      {/* Hero Section */}
      <section className="mx-auto max-w-5xl text-center space-y-6">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          Verse Together
        </h1>
        <p className="text-xl sm:text-2xl text-foreground/70 font-medium">
          Study deeply. Capture insights. Revisit what matters.
        </p>
        <p className="text-base sm:text-lg text-foreground/60 max-w-3xl mx-auto">
          Verse Together is a scripture study workspace with modern note-taking and built-in study
          helps. Read by verse, compare Bible translations, explore dictionary definitions, and build
          organized notes with folders, tags, and exports.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-6 py-3 text-base font-medium hover:opacity-90 transition-opacity"
            data-ripple
          >
            Open Scripture Reader
          </Link>
          <Link
            href="/feed"
            className="inline-flex items-center rounded-md border-2 border-foreground/20 px-6 py-3 text-base font-medium hover:bg-foreground/5 transition-colors"
          >
            Open Notes Workspace
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center rounded-md border-2 border-foreground/20 px-6 py-3 text-base font-medium hover:bg-foreground/5 transition-colors"
          >
            View Study Guide
          </Link>
        </div>
      </section>

      {/* New Study Tools Section */}
      <section className="mx-auto max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold">Built For Better Scripture Study</h2>
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            The latest updates are focused on stronger study workflows: capture insights quickly,
            compare wording across translations, and pull dictionary context without leaving your reader.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-10">
          <FeatureCard
            icon="📝"
            title="Notes Workspace"
            description="Create scripture-based notes, keep drafts and published notes separate, and organize everything with folders, tags, and search."
          />
          <FeatureCard
            icon="📚"
            title="In-Context Dictionary Help"
            description="Select a word and review dictionary entries directly in your study panel, then send useful definitions into your notes."
          />
          <FeatureCard
            icon="↔️"
            title="Bible Translation Comparison"
            description="View translation differences inline or side-by-side so you can spot wording changes and study passages with more precision."
          />
          <FeatureCard
            icon="🔎"
            title="Footnotes And Cross-References"
            description="Follow scripture footnotes and related links in one reading flow, then capture those findings as reusable note blocks."
          />
        </div>
      </section>

      {/* Full Feature Section */}
      <section className="mx-auto max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold">Everything In One Study Flow</h2>
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            From reading to note capture to organization, each step is connected so your insights are
            easy to build on later.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          <FeatureCard
            icon="📖"
            title="Scripture Reader"
            description="Move across books and chapters quickly while keeping your study context in one place."
          />
          <FeatureCard
            icon="✨"
            title="Verse-To-Note Capture"
            description="Select verses, add commentary, and send excerpts or study cards straight into a note."
          />
          <FeatureCard
            icon="🗂️"
            title="Organization Tools"
            description="Use folders, tags, filters, and exports to keep notes ready for lessons, talks, and personal study."
          />
          <FeatureCard
            icon="🎙️"
            title="Conference Links"
            description="Find General Conference connections tied to your current verses and open them directly."
          />
          <FeatureCard
            icon="🧭"
            title="Reader Preferences"
            description="Adjust text presentation, enable study aids, and set comparison view defaults that match how you read."
          />
          <FeatureCard
            icon="🤝"
            title="Share And Revisit"
            description="Publish notes when you want to share, or keep them private and searchable for ongoing study."
          />
        </div>
      </section>

      {/* How It Works Section */}
      <section className="mx-auto max-w-4xl space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold">How It Works</h2>
          <p className="text-lg text-foreground/70">
            Get started in three simple steps
          </p>
        </div>
        
        <div className="grid sm:grid-cols-3 gap-6 mt-10">
          <StepCard
            number="1"
            title="Read And Explore"
            description="Start in the scripture reader, then explore references, footnotes, dictionaries, and translation comparisons."
          />
          <StepCard
            number="2"
            title="Capture Insights"
            description="Add selected verses and study findings into a new or existing note with a few clicks."
          />
          <StepCard
            number="3"
            title="Organize And Reuse"
            description="Sort notes with folders and tags, then export or publish when you are ready to share."
          />
        </div>
      </section>

      {/* Call to Action */}
      <section className="mx-auto max-w-3xl text-center space-y-6 py-12 rounded-2xl border surface-card-soft">
        <h2 className="text-2xl sm:text-3xl font-bold">Ready to Begin?</h2>
        <p className="text-base sm:text-lg text-foreground/70">
          Open the reader and begin building your next study note.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-6 py-3 text-base font-medium hover:opacity-90 transition-opacity"
            data-ripple
          >
            Start Studying
          </Link>
          <Link
            href="/feed"
            className="inline-flex items-center rounded-md border-2 border-foreground/20 px-6 py-3 text-base font-medium hover:bg-foreground/5 transition-colors"
          >
            Go To Notes
          </Link>
        </div>
      </section>

      {/* Feedback Section */}
      <section className="mx-auto max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">We'd Love Your Feedback</h2>
          <p className="text-foreground/70">
            Help us improve Verse Together by sharing your thoughts and suggestions.
          </p>
        </div>
        <FeedbackForm />
      </section>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: string; 
  title: string; 
  description: string;
}) {
  return (
    <div className="rounded-lg border surface-card p-6 hover:border-foreground/30 transition-colors">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-foreground/70 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-foreground text-background text-xl font-bold">
        {number}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-foreground/70 leading-relaxed">{description}</p>
    </div>
  );
}
