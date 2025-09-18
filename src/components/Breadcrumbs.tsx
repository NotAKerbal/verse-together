import Link from "next/link";

export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-foreground/70">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((c, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {c.href ? (
              <Link href={c.href} className="hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="text-foreground">{c.label}</span>
            )}
            {idx < items.length - 1 ? (
              <span className="text-foreground/40">/</span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}


