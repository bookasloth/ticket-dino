import type { MetadataRoute } from 'next';
import { publicDb } from '@/lib/supabase/public';

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await publicDb().from('events').select('slug, starts_at').eq('status', 'published');
  const pages = ['', '/about', '/tour', '/hire', '/faq', '/contact', '/terms', '/privacy', '/refund-policy'];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly' as const })),
    ...(data ?? []).map((e) => ({ url: `${base}/e/${e.slug}`, changeFrequency: 'daily' as const })),
  ];
}
