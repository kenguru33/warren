# Multi-stage build:
#   * deps   — installs full prod+dev node_modules (compiles better-sqlite3)
#   * builder — runs `next build`
#   * runner — copies the build output and the prod node_modules; runs `next start`.
#
# We intentionally do NOT use Next.js `output: "standalone"` so the better-sqlite3
# native binding always travels with the runtime image. The trade-off is a
# slightly larger image, in exchange for a build that doesn't depend on Next's
# tracer correctly walking the native addon's files.

FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV WARREN_DATA_DIR=/data

# Non-root runtime user. Create /data with the right owner BEFORE
# declaring the VOLUME so a fresh named volume inherits correct
# perms — otherwise SQLite hits SQLITE_CANTOPEN on first boot.
RUN addgroup --system --gid 1001 warren \
 && adduser --system --uid 1001 --ingroup warren warren \
 && mkdir -p /data \
 && chown warren:warren /data

COPY --from=builder --chown=warren:warren /app/package.json /app/package.json
COPY --from=builder --chown=warren:warren /app/.next /app/.next
COPY --from=builder --chown=warren:warren /app/public /app/public
COPY --from=builder --chown=warren:warren /app/node_modules /app/node_modules
COPY --from=builder --chown=warren:warren /app/next.config.ts /app/next.config.ts
COPY --from=builder --chown=warren:warren /app/proxy.ts /app/proxy.ts
COPY --from=builder --chown=warren:warren /app/instrumentation.ts /app/instrumentation.ts

VOLUME ["/data"]
EXPOSE 3000

USER warren

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "next", "start"]
