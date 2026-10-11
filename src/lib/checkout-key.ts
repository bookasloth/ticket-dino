/** Identity of a checkout attempt: a pending Razorpay order is reused only while this is unchanged. */
export function checkoutKey(
  items: { ticketTypeId: string; qty: number }[],
  buyer: { name: string; email: string; phone: string },
): string {
  return JSON.stringify([items.map((i) => [i.ticketTypeId, i.qty]), buyer.name, buyer.email, buyer.phone]);
}
