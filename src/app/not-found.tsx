import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="bg-[#1a1412] text-[#f3ead8]">
      <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center px-4 py-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-[#c9a25c]">Error 404</p>
        <h1 className="mt-5 max-w-2xl font-display text-6xl leading-[1.05] sm:text-7xl">This page has left the stage.</h1>
        <p className="mt-6 max-w-md font-light text-[#f3ead8]/70">The link may be old, or the show may have ended. The rest of the season is still on.</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/#events" className="rounded-sm bg-[#c9a25c] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#1a1412] transition-colors hover:bg-[#d8b36e]">View programme</Link>
          <Link href="/contact" className="rounded-sm border border-[#f3ead8]/25 px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] transition-colors hover:border-[#f3ead8]/60">Contact us</Link>
        </div>
      </div>
    </main>
  );
}
