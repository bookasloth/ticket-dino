import { Document, Image, Page, StyleSheet, Text, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatIST } from '@/lib/time';
import type { OrderEmailData } from './load';
import { ticketUrl } from './url';

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 11, fontFamily: 'Helvetica' },
  brand: { fontSize: 10, color: '#2e7d4f', fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 16, marginTop: 6, fontFamily: 'Helvetica-Bold' },
  row: { marginTop: 4 },
  qr: { width: 190, height: 190, marginTop: 12, alignSelf: 'center' },
  small: { fontSize: 8, color: '#666', marginTop: 8, textAlign: 'center' },
});

// Built-in Helvetica lacks U+202F (narrow no-break space) that en-IN dates use.
const pdfDate = (iso: string) => formatIST(iso, { dateStyle: 'full' }).replace(/ /g, ' ');

export async function renderTicketsPdf(d: Pick<OrderEmailData, 'orderNo' | 'event' | 'tickets'>): Promise<Buffer> {
  const qrs = await Promise.all(d.tickets.map((t) => QRCode.toDataURL(ticketUrl(t.token), { margin: 1, width: 600 })));
  return renderToBuffer(
    <Document title={`Tickets TD-${d.orderNo}`}>
      {d.tickets.map((t, i) => (
        <Page key={t.token} size="A6" style={s.page}>
          <Text style={s.brand}>TicketDino</Text>
          <Text style={s.title}>{d.event.title}</Text>
          <Text style={s.row}>{pdfDate(d.event.startsAt)}</Text>
          {d.event.venue ? <Text style={s.row}>{d.event.venue}</Text> : null}
          <Text style={s.row}>
            {t.ticketType} · {t.attendeeName}
          </Text>
          <Image src={qrs[i]} style={s.qr} />
          <Text style={s.small}>
            Order TD-{d.orderNo} · Ticket {i + 1} of {d.tickets.length} · Valid for one entry
          </Text>
        </Page>
      ))}
    </Document>,
  );
}
