import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@influxdata/influxdb3-client",
    "mqtt",
  ],
  // Next 16 blocks dev assets (including the HMR WebSocket) from origins
  // other than the hostname the dev server was bound to. Warren runs on a
  // home LAN so the dashboard is typically accessed from a different
  // machine than the one running `next dev`. Set WARREN_DEV_ORIGINS in the
  // environment to a comma-separated list of hostnames to allow (e.g.
  // `WARREN_DEV_ORIGINS=192.168.80.60,warren.local`). The wildcard suffix
  // pattern `*.local` covers mDNS resolution; specific IPs need to be
  // listed explicitly because Next's matcher only supports subdomain
  // wildcards, not arbitrary IP-octet wildcards.
  allowedDevOrigins: [
    "*.local",
    ...(process.env.WARREN_DEV_ORIGINS ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
  ],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
    ];
  },
};

export default nextConfig;
