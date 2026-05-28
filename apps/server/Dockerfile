# syntax=docker/dockerfile:1.7
#
# Popshot relay server — runs on Bun, exposes Hono HTTP + WebSocket on PORT (default 3000).
# Built to be deployed by Dokploy (Traefik reverse-proxy fronts TLS for /ws).
#
# Required env at runtime:
#   DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
#   SHARED_KEY (min 16 chars, same value as in the desktop app settings)
#   CORS_ORIGIN (your public origin, e.g. https://relay.example.com)
#   DATABASE_URL (e.g. file:/data/popshot.db — mount /data as a persistent volume)
# Optional:
#   DISCORD_CHANNEL_ID (lock /send to a single channel)
#   NODE_ENV=production

FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo

COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json ./apps/server/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/

RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY tsconfig.json turbo.json ./
COPY apps/server ./apps/server
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY packages/env ./packages/env

ENV NODE_ENV=production
EXPOSE 3000

# Persistent SQLite — Dokploy should mount a volume at /data and
# the env var DATABASE_URL=file:/data/popshot.db should point here.
VOLUME ["/data"]

WORKDIR /repo/apps/server

# On boot: push the Drizzle schema (idempotent), then start the server.
CMD ["sh", "-c", "cd /repo/packages/db && bun x drizzle-kit push --force --verbose || true && cd /repo/apps/server && exec bun run src/index.ts"]
