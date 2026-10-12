export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="bg-[#1a1412] text-[#f3ead8]">
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-[#c9a25c]">{eyebrow}</p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.05] sm:text-6xl">{title}</h1>
        {intro && <p className="mt-6 max-w-xl text-base font-light leading-relaxed text-[#f3ead8]/70">{intro}</p>}
      </div>
    </section>
  );
}

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#a3803f]">{children}</p>
);
