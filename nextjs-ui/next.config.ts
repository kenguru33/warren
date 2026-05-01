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
  // machine than the one running `next dev` — allow the common RFC1918
  // ranges so HMR works for any host on the local network.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "*.local",
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
