import Link from "next/link";
import MigrationNotice from "../components/MigrationNotice";
import FeedbackForm from "../components/FeedbackForm";

export default function Home() {
  return (
    <div className="space-y-16 sm:space-y-24 py-12 sm:py-20">
      {/* Hero Section */}
      <section className="mx-auto max-w-4xl text-center space-y-6">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          Verse Together
        </h1>
        <p className="text-xl sm:text-2xl text-foreground/70 font-medium">
          Share scriptures. Bear testimony. Learn together.
        </p>
        <p className="text-base sm:text-lg text-foreground/60 max-w-2xl mx-auto">
          A community platform for discovering, sharing, and discussing scripture. 
          Highlight verses, add your notes, find related conference talks, and 
          connect with others on their spiritual journey.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-6 py-3 text-base font-medium hover:opacity-90 transition-opacity"
            data-ripple
          >
            Browse Scriptures
          </Link>
          <Link
            href="/feed"
            className="inline-flex items-center rounded-md border-2 border-foreground/20 px-6 py-3 text-base font-medium hover:bg-foreground/5 transition-colors"
          >
            Open Notes Workspace
          </Link>
        </div>
      </section>

      <MigrationNotice />

      {/* What is Verse Together Section */}
      <section className="mx-auto max-w-5xl space-y-8">
        <div className="text-center space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold">What is Verse Together?</h2>
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            Verse Together is a modern platform designed to enhance your scripture study 
            and help you capture, organize, and share meaningful scripture notes.
          </p>
        </div>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          <FeatureCard
            icon="📖"
            title="Browse Scriptures"
            description="Navigate through all standard works with an intuitive reader. Jump between books, chapters, and verses effortlessly."
          />
          <FeatureCard
            icon="✨"
            title="Capture Notes"
            description="Select verses that inspire you, add your thoughts, and keep study notes tied directly to scripture references."
          />
          <FeatureCard
            icon="🗂️"
            title="Organize Notes"
            description="Use tags, folders, and filters so your notes are easy to revisit for talks, lessons, and personal study."
          />
          <FeatureCard
            icon="🎙️"
            title="Find Conference Talks"
            description="Discover General Conference talks that reference the verses you're studying. Listen directly in Gospel Library."
          />
          <FeatureCard
            icon="🔗"
            title="Explore Connections"
            description="Navigate cross-references and footnotes to deepen your understanding and see how verses connect across the standard works."
          />
          <FeatureCard
            icon="⚙️"
            title="Customize Your Study"
            description="Adjust font size, line width, and reading tools to create the perfect study environment for your needs."
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
            title="Browse & Read"
            description="Start by browsing scriptures. Find verses that speak to you as you read through the standard works."
          />
          <StepCard
            number="2"
            title="Capture Your Note"
            description="Tap verses and add a new note or append to an existing note from the action panel."
          />
          <StepCard
            number="3"
            title="Organize & Reuse"
            description="Move notes into folders, apply tags, and export notes when you want to share or archive."
          />
        </div>
      </section>

      {/* Call to Action */}
      <section className="mx-auto max-w-3xl text-center space-y-6 py-12 rounded-2xl border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5">
        <h2 className="text-2xl sm:text-3xl font-bold">Ready to Begin?</h2>
        <p className="text-base sm:text-lg text-foreground/70">
          Join the community and start sharing your favorite verses today.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/browse"
            className="inline-flex items-center rounded-md bg-foreground text-background px-6 py-3 text-base font-medium hover:opacity-90 transition-opacity"
            data-ripple
          >
            Start Browsing Scriptures
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
    <div className="rounded-lg border border-black/10 dark:border-white/15 p-6 hover:border-foreground/30 transition-colors">
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
