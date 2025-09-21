import Feed from "@/components/Feed";

export default function FeedPage() {
  return (
    <section className="py-8 sm:py-12 space-y-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Top shared scriptures</h1>
        <p className="mt-2 text-sm text-foreground/70">See the most loved and discussed verses from the community.</p>
      </div>
      <Feed />
    </section>
  );
}


