import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle: ReactNode;
  eyebrow?: string;
  beforeTitle?: ReactNode;
  spacing?: "normal" | "relaxed";
  subtitleSize?: "default" | "small";
  children?: ReactNode;
};

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  beforeTitle,
  spacing = "normal",
  subtitleSize = "default",
  children,
}: Props) {
  return (
    <header className={`page-hero ${spacing === "relaxed" ? "space-y-4" : "space-y-3"}`}>
      {beforeTitle ?? (eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null)}
      <h1 className="page-title">{title}</h1>
      <p className={subtitleSize === "small" ? "page-subtitle text-sm" : "page-subtitle"}>{subtitle}</p>
      {children}
    </header>
  );
}
