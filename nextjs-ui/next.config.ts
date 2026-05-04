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
  // machine than the one running `next dev`. The host's LAN IP and
  // optional custom hostname (both written to .env by `warren setup`) are
  // allowlisted automatically; WARREN_DEV_ORIGINS extends the list with
  // anything else (comma-separated). `*.local` covers mDNS resolution.
  allowedDevOrigins: [
    "*.local",
    ...[process.env.WARREN_LAN_IP, process.env.WARREN_HOSTNAME]
      .filter((v): v is string => typeof v === "string" && v.length > 0),
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
