import { ImageResponse } from 'next/og';
import { formatIST } from '@/lib/time';
import { getPublicEvent } from './data';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Event poster';

// Used when the event has no uploaded poster: same typographic style as PosterArt.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getPublicEvent((await params).slug);
  const [main, sub] = (event?.title ?? 'Upcoming event').split(':');
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#1a1412', padding: 28 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(201,162,92,0.5)', color: '#f3ead8', fontFamily: 'serif' }}>
          <div style={{ fontSize: 22, letterSpacing: 10, color: '#c9a25c', textTransform: 'uppercase' }}>{event?.category ?? 'Live'}</div>
          <div style={{ fontSize: 88, marginTop: 24, textAlign: 'center', maxWidth: 1000 }}>{main}</div>
          {sub && <div style={{ fontSize: 40, marginTop: 12, fontStyle: 'italic', opacity: 0.8 }}>{sub.trim()}</div>}
          <div style={{ width: 80, height: 2, background: '#c9a25c', marginTop: 36 }} />
          {event && (
            <div style={{ fontSize: 26, marginTop: 28, opacity: 0.75 }}>
              {`${formatIST(event.starts_at, { dateStyle: 'full' })}${event.venue ? ` · ${event.venue.name}` : ''}`}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
