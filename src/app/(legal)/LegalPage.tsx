import { PageHero } from '@/components/PageHero';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main>
      <PageHero eyebrow="Policies · Last updated 11 October 2026" title={title} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 leading-relaxed text-muted-foreground [&_a]:text-foreground [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </main>
  );
}
