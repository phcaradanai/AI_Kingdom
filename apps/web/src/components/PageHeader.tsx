export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</div>
      <h1 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
