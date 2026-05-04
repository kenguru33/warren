# Multi-stage Caddy build with optional DNS provider plugin.
# Used only in Let's Encrypt mode (warren setup writes WARREN_TLS_MODE=letsencrypt).
# Local-CA mode skips this entirely and uses the stock caddy:2.10-alpine image.
#
# Build arg CADDY_DNS_PLUGIN selects the caddy-dns provider compiled in.
# Default is Cloudflare. Override at build time:
#   docker build --build-arg CADDY_DNS_PLUGIN=github.com/caddy-dns/route53 ...

ARG CADDY_DNS_PLUGIN=github.com/caddy-dns/cloudflare

FROM caddy:2.10-builder AS build
ARG CADDY_DNS_PLUGIN
RUN xcaddy build --with "${CADDY_DNS_PLUGIN}"

FROM caddy:2.10-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
