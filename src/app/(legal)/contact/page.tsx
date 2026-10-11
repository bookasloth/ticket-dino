import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Contact · TicketDino' };
export default function Contact() {
  const email = process.env.SUPPORT_EMAIL ?? 'support@example.com';
  return (
    <LegalPage title="Contact us">
      <p>TicketDino is operated by <strong>Timewheel Internet Pvt Ltd</strong>.</p>
      <p>Email: <a className="underline" href={`mailto:${email}`}>{email}</a></p>
      <p>Please include your order number (it starts with TD-) so we can help faster.</p>
    </LegalPage>
  );
}
