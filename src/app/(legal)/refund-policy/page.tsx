import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Refunds and cancellations · TicketDino' };
export default function RefundPolicy() {
  return (
    <LegalPage title="Refunds and cancellations">
      <p>Each event sets its own refund policy, shown on the event page before you pay.</p>
      <h2>Cancelled events</h2>
      <p>If the organizer cancels, you get a full refund to the original payment method.</p>
      <h2>Payment problems</h2>
      <p>If money was debited but no ticket was issued, it is refunded automatically, usually within 5–7 working days.</p>
      <h2>How refunds reach you</h2>
      <p>Refunds go back to the original payment method through Razorpay. Banks usually take 5–7 working days.</p>
    </LegalPage>
  );
}
