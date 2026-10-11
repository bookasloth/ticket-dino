import { safeEqual } from './webhook';

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}
