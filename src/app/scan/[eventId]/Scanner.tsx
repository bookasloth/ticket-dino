'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tokenFromScan } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

type Result = {
  result: 'ok' | 'already_used' | 'wrong_event' | 'void' | 'not_found' | 'forbidden' | 'error';
  attendee_name?: string;
  ticket_type?: string;
  checked_in_at?: string;
  checked_in_by?: string;
};
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function describe(r: Result): { ok: boolean; title: string; detail?: string } {
  switch (r.result) {
    case 'ok':
      return { ok: true, title: 'Valid ✓', detail: [r.attendee_name, r.ticket_type].filter(Boolean).join(' · ') };
    case 'already_used':
      return {
        ok: false,
        title: 'Already scanned',
        detail: [r.checked_in_at && formatIST(r.checked_in_at, { dateStyle: undefined, timeStyle: 'medium' }), r.checked_in_by && `by ${r.checked_in_by}`]
          .filter(Boolean).join(' '),
      };
    case 'wrong_event': return { ok: false, title: 'Wrong event', detail: 'This ticket is for a different event.' };
    case 'void': return { ok: false, title: 'Void ticket', detail: 'Refunded or cancelled.' };
    case 'not_found': return { ok: false, title: 'Not a valid ticket' };
    case 'forbidden': return { ok: false, title: 'Not allowed', detail: "You aren't assigned to this event." };
    default: return { ok: false, title: 'Network error', detail: 'Scan again.' };
  }
}

export function Scanner({ eventId, title }: { eventId: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recent = useRef(new Map<string, number>());
  const busy = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const show = useCallback((r: Result) => {
    setResult(r);
    navigator.vibrate?.(r.result === 'ok' ? 80 : [200, 100, 200]);
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), r.result === 'ok' ? 1500 : 3500);
  }, []);

  const onCode = useCallback(
    async (text: string) => {
      const token = tokenFromScan(text);
      const key = token ?? text;
      const last = recent.current.get(key);
      if (last && Date.now() - last < 2500) return; // same QR still in front of the camera
      recent.current.set(key, Date.now());
      if (!token) return show({ result: 'not_found' });
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, eventId }),
        });
        show(await res.json());
      } catch {
        show({ result: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [eventId, show],
  );

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: { stop(): Promise<void> } | null = null;

    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Ctor) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new Ctor({ formats: ['qr_code'] });
          const loop = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]) await onCode(codes[0].rawValue);
            } catch {
              // frame not ready yet
            }
            timer = setTimeout(loop, 120);
          };
          loop();
        } else {
          const { Html5Qrcode } = await import('html5-qrcode'); // iOS Safari and older Android
          const h = new Html5Qrcode('qr-fallback');
          await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => void onCode(text), () => {});
          if (stopped) await h.stop();
          else fallback = h;
        }
      } catch {
        setCameraError('Camera unavailable. Allow camera access in your browser settings, or type the ticket code below.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      fallback?.stop().catch(() => {});
    };
  }, [onCode]);

  const r = result && describe(result);
  return (
    <main className="mx-auto max-w-md px-4 py-4">
      <Link href="/scan" className="text-sm underline">← Events</Link>
      <h1 className="mb-3 mt-1 font-semibold">{title}</h1>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div id="qr-fallback" className="absolute inset-0" />
        {r && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white ${r.ok ? 'bg-green-600' : 'bg-red-600'}`}
            aria-live="assertive"
          >
            <span className="text-3xl font-bold">{r.title}</span>
            {r.detail && <span className="mt-2 text-lg">{r.detail}</span>}
          </button>
        )}
      </div>
      {cameraError && <p className="mt-3 text-sm text-destructive">{cameraError}</p>}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          recent.current.delete(manual.trim());
          void onCode(manual);
          setManual('');
        }}
      >
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type ticket code" aria-label="Ticket code" />
        <Button type="submit" variant="secondary">Check</Button>
      </form>
    </main>
  );
}
