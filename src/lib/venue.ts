// ponytail: single-venue demo copy; move to organizers.settings when a second venue signs up
export const VENUE = {
  name: 'Chhayatai Nikhare Sabhagruh',
  tagline: 'Where the city comes together for natak, music and more',
  about:
    'A fully air-conditioned auditorium hosting Marathi natak, classical and light music, dance recitals, comedy and community programmes all year round. Comfortable seating, great acoustics and easy parking make it a favourite evening out for families.',
  stats: [
    { value: '750', label: 'Seats' },
    { value: '200+', label: 'Shows a year' },
    { value: '1 lakh+', label: 'Happy guests' },
  ],
  amenities: ['Air-conditioned hall', 'Free parking', 'Wheelchair access', 'Canteen & snacks', 'Clean washrooms', 'Pro sound & lights'],
  phone: '+91 98765 43210',
  email: 'bookings@chhayatainikhare.example',
  mapsQuery: 'Chhayatai Nikhare Sabhagruh',
};

export const mapsEmbed = (q: string) => `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;

/** ₹299.00 → ₹299 for display-only spots (receipts keep paise). */
export const shortINR = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
