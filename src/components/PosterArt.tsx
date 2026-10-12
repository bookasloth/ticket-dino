import { cn } from '@/lib/utils';

// ponytail: typographic poster for events without an uploaded one; tone keyed by category
const TONES: Record<string, string> = {
  Music: 'bg-[#3b1a1a]',
  Theatre: 'bg-[#2a1416]',
  Comedy: 'bg-[#2f2a1c]',
  Dance: 'bg-[#2b1a2e]',
  Kids: 'bg-[#1b2b26]',
  Folk: 'bg-[#3a2216]',
  Talks: 'bg-[#16202e]',
};

export function PosterArt({ title, category, className }: { title: string; category: string | null; className?: string }) {
  const [main, sub] = title.split(':');
  return (
    <div className={cn('@container relative overflow-hidden text-[#f3ead8]', TONES[category ?? ''] ?? 'bg-stone-900', className)}>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,162,92,0.18),transparent_60%)]" />
      <div className="absolute inset-3 flex flex-col items-center justify-center border border-[#c9a25c]/40 px-6 text-center">
        {category && <span className="text-[10px] font-medium uppercase tracking-[0.35em] text-[#c9a25c] @md:text-xs">{category}</span>}
        <span className="mt-3 font-display text-2xl leading-tight @md:text-4xl @xl:text-5xl">{main}</span>
        {sub && <span className="mt-2 font-display text-sm italic text-[#f3ead8]/75 @md:text-lg">{sub.trim()}</span>}
        <span aria-hidden className="mt-4 h-px w-10 bg-[#c9a25c]/60" />
      </div>
    </div>
  );
}
