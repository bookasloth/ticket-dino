import type { Metadata } from 'next';
import { OrderStatus } from './OrderStatus';

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ id }, { k = '' }] = await Promise.all([params, searchParams]);
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <OrderStatus id={id} k={k} supportEmail={process.env.SUPPORT_EMAIL ?? ''} />
    </main>
  );
}
