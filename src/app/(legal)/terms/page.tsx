import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Terms of use · TicketDino' };
export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>TicketDino is operated by Timewheel Internet Pvt Ltd (“we”). By buying a ticket you agree to these terms.</p>
      <h2>Tickets</h2>
      <p>A ticket admits one person to the event named on it. Each QR code can be scanned once. Do not share it: the first scan wins.</p>
      <h2>Payments</h2>
      <p>Payments are processed by Zoho Payments. We never see or store your card details. Prices include the booking fee and GST shown at checkout.</p>
      <h2>Event changes</h2>
      <p>The organizer may change the time or venue. If an event is cancelled you get a full refund.</p>
      <h2>Entry</h2>
      <p>The organizer and venue may refuse entry for safety reasons or to anyone without a valid ticket.</p>
      <h2>Contact</h2>
      <p>Questions? See our <a className="underline" href="/contact">contact page</a>.</p>
    </LegalPage>
  );
}
