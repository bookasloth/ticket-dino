import { cn } from '@/lib/utils';

// ponytail: generated poster for events without an uploaded one; colour keyed by category
const THEMES: Record<string, string> = {
  Music: 'from-amber-500 via-orange-600 to-rose-700',
  Theatre: 'from-rose-700 via-red-800 to-stone-900',
  Comedy: 'from-yellow-400 via-amber-500 to-orange-600',
  Dance: 'from-fuchsia-600 via-pink-600 to-rose-500',
  Kids: 'from-lime-400 via-emerald-500 to-teal-600',
  Folk: 'from-orange-500 via-red-600 to-fuchsia-800',
  Talks: 'from-sky-500 via-indigo-600 to-violet-800',
};

export function PosterArt({ title, category, className }: { title: string; category: string | null; className?: string }) {
  const [main, sub] = title.split(':');
  return (
    <div
      className={cn(
        '@container relative flex flex-col justify-end overflow-hidden bg-gradient-to-br p-5 text-white',
        THEMES[category ?? ''] ?? 'from-slate-600 to-slate-900',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:14px_14px]" />
      <div aria-hidden className="absolute -right-[15%] -top-[25%] aspect-square w-[55%] rounded-full border-[18px] border-white/15" />
      <div aria-hidden className="absolute -right-[2%] top-[30%] aspect-square w-[18%] rounded-full bg-white/15" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/45 to-transparent" />
      {category && <span className="relative mb-2 w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest backdrop-blur">{category}</span>}
      <span className="relative font-display text-2xl font-semibold leading-tight drop-shadow @md:text-4xl @xl:text-5xl">{main}</span>
      {sub && <span className="relative mt-1 text-sm text-white/90 @md:text-lg">{sub.trim()}</span>}
    </div>
  );
}
