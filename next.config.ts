import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Fix Next.js 16 CSS Hydration chunk dropping ($undefined nonces) by strictly using SWC minification and React Compiler
  // Revert invalid experimental keys
  serverExternalPackages: [
    "@opentelemetry/api",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
    "@google-cloud/opentelemetry-cloud-trace-exporter",
    "google-proto-files",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      // Disable iframe embedding entirely on API routes
      {
        source: "/api/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.hlbw.org",
          },
        ],
        destination: "https://hlbw.org/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "(?<project>.*)\\.a\\.run\\.app",
          },
        ],
        destination: "https://hlbw.org/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
