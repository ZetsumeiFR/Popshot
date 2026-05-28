# syntax=docker/dockerfile:1.7
#
# Popshot relay server — Bun + Hono HTTP/WebSocket on port 3000.
#
# Monorepo-aware build using `turbo prune`: only the `server` package and its
# workspace dependency graph (@popshot/config, @popshot/db, @popshot/env) are
# pruned, installed, and shipped — apps/web and packages/ui never enter the
# image. Bun installs each workspace's deps under that package's own
# node_modules (it does not hoist to the root), and the pruned layout preserves
# that whole tree, so no manual node_modules juggling is needed.
#
# Deployed by Dokploy (Traefik reverse-proxy fronts TLS for /ws).
#
# Required env at runtime:
#   DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
#   SHARED_KEY (min 16 chars, same value as in the desktop app settings)
#   CORS_ORIGIN (a valid URL, e.g. https://relay.example.com)
#   DATABASE_URL (e.g. file:/data/popshot.db — mount /data as a persistent volume)
# Optional:
#   DISCORD_CHANNEL_ID (lock /send to a single channel)

FROM oven/bun:1.3-alpine AS base

# 1. Prune the monorepo to the `server` package and its dependency graph.
#    --docker splits the result into out/json (manifests + lockfile) and
#    out/full (source) so dependency installs cache independently of code.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN bunx turbo@2.9.16 prune server --docker

# 2. Install from the pruned manifests first (this layer is cached unless a
#    package.json or the lockfile changes), then overlay the pruned source.
FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
RUN bun install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./

# 3. Runtime image — carries the full installed + source tree.
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=installer /repo ./

EXPOSE 3000

# Persistent SQLite — Dokploy should mount a volume at /data and
# DATABASE_URL=file:/data/popshot.db should point here.
VOLUME ["/data"]

WORKDIR /repo/apps/server

# On boot: push the Drizzle schema (idempotent), then start the server.
CMD ["sh", "-c", "cd /repo/packages/db && bunx drizzle-kit push --force --verbose || true && cd /repo/apps/server && exec bun run src/index.ts"]
