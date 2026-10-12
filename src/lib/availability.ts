export type SaleWindow = {
  capacity: number;
  sold_count: number;
  held_count: number;
  sale_starts_at: string;
  sale_ends_at: string;
};
export type SaleState = 'on_sale' | 'sold_out' | 'not_started' | 'ended';

export const available = (t: SaleWindow) => Math.max(0, t.capacity - t.sold_count - t.held_count);

export function saleState(t: SaleWindow, now = new Date()): SaleState {
  if (now < new Date(t.sale_starts_at)) return 'not_started';
  if (now >= new Date(t.sale_ends_at)) return 'ended';
  return available(t) > 0 ? 'on_sale' : 'sold_out';
}
