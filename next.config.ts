import type { NextConfig } from 'next';

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:56321');
const isLocal = ['127.0.0.1', 'localhost'].includes(supabase.hostname);
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const config: NextConfig = {
  // Tailwind 4 via the Next 16 turbopack loader (no PostCSS config)
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } }, // poster uploads
  images: {
    unoptimized: isLocal, // Next blocks optimizing images from local IPs
    remotePatterns: [
      {
        protocol: supabase.protocol.replace(':', '') as 'http' | 'https',
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return ['/t/:path*', '/orders/:path*', '/admin/:path*', '/scan/:path*', '/login'].map((source) => ({
      source,
      headers: noindex,
    }));
  },
};

export default config;
