import Feed from "@/components/Feed";

export default function FeedPage() {
  return (
    <section className="py-8 sm:py-12 space-y-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Published insights</h1>
        <p className="mt-2 text-sm text-foreground/70">Explore thoughtful insight stacks from the community and add scriptures to your own draft as you read.</p>
      </div>
      <Feed />
    </section>
  );
}


