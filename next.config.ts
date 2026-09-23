import type { NextConfig } from "next";

const demoMode = ["1", "true", "on"].includes(
  process.env.DEMO_MODE?.trim().toLowerCase() ?? ""
);

const allowedDevOrigins = process.env.DEMO_ALLOWED_HOSTS
  ?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const securityHeaders = [
  { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production" && !demoMode
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins:
    allowedDevOrigins && allowedDevOrigins.length > 0
      ? allowedDevOrigins
      : demoMode
        ? ["172.20.40.214", "dev.bargheto.com", "localhost"]
        : undefined,
  // Keep client and server assets on the same immutable release during rolling deploys.
  deploymentId: process.env.DEPLOYMENT_VERSION,

  // Optimize output
  output: "standalone",
  
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  
  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
  },
  
  // Optimize headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
