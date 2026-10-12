import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const limiters = redis
  ? {
      checkoutIp: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:checkout:ip' }),
      checkoutPhone: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 m'), prefix: 'rl:checkout:phone' }),
      login: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:login' }),
    }
  : null;

export type Bucket = 'checkoutIp' | 'checkoutPhone' | 'login';

/** Brief rule 9. No-op without Upstash, except in Vercel production where it fails loudly. */
export async function allow(bucket: Bucket, key: string): Promise<boolean> {
  if (!limiters) {
    if (process.env.VERCEL_ENV === 'production') throw new Error('Rate limiting is not configured');
    return true;
  }
  return (await limiters[bucket].limit(key)).success;
}

export async function clientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
