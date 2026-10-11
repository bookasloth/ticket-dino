import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Privacy policy · TicketDino' };
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>We collect your name, email and phone number to issue and deliver your tickets, verify entry and contact you about the event.</p>
      <h2>Who sees your data</h2>
      <p>Only the organizer of the event you booked and our support team. We do not sell your data.</p>
      <h2>Payments</h2>
      <p>Card and UPI details are handled by Razorpay and never reach our servers.</p>
      <h2>Your rights (DPDP Act, 2023)</h2>
      <p>You can ask us to access, correct or delete your data by writing to the email on our contact page. We keep order records as long as tax law requires.</p>
      <h2>Security</h2>
      <p>Data is encrypted in transit and access is limited to authorised staff. We will notify you and the authorities of any breach as the law requires.</p>
    </LegalPage>
  );
}
