export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">Last updated: 11 October 2026</p>
      {children}
    </main>
  );
}
