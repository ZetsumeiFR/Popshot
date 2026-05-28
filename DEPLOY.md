# Deploying the Popshot relay on Dokploy

The relay (`apps/server`) is the only piece that needs to be hosted: a Hono+Bun
process that runs the Discord bot and a WebSocket bridge to the desktop clients.
The Tauri desktop app is installed locally on each "popshot" recipient and
connects to the relay via `wss://<your-domain>/ws`.

## 1. Prepare your Discord bot

1. Go to <https://discord.com/developers/applications>, create a new
   Application, then add a Bot.
2. Note the **Application ID** (= `DISCORD_CLIENT_ID`) and the **Bot Token**
   (= `DISCORD_TOKEN`).
3. Invite the bot to your guild with the `applications.commands` and `bot`
   scopes.
4. Copy the guild ID (= `DISCORD_GUILD_ID`).

## 2. Push your repo

Dokploy pulls from GitHub/GitLab. Push the whole monorepo as-is — the
`apps/server/Dockerfile` consumes the workspace.

## 3. Create the Dokploy Application

- **Source**: GitHub repo, `main` branch.
- **Build type**: Dockerfile.
- **Dockerfile path**: `apps/server/Dockerfile`.
- **Build context**: repo root (`.`), so the Docker build has access to the
  workspace lockfile and the shared `packages/`.

### Environment variables

| Key | Value |
| --- | --- |
| `DISCORD_TOKEN` | bot token from step 1 |
| `DISCORD_CLIENT_ID` | application ID from step 1 |
| `DISCORD_GUILD_ID` | guild ID from step 1 |
| `DISCORD_CHANNEL_ID` | *(optional)* lock `/send` to a single channel |
| `SHARED_KEY` | min 16 chars; same value the desktop client uses |
| `CORS_ORIGIN` | your public origin, e.g. `https://relay.example.com` |
| `DATABASE_URL` | `file:/data/popshot.db` |
| `NODE_ENV` | `production` |

### Volumes

Add a persistent volume mounted at `/data` so the SQLite database survives
container restarts. The mapping table `discord_targets` lives here.

### Domain & TLS

Add a domain (e.g. `relay.example.com`) in the Domains section. Dokploy's
built-in Traefik will provision a Let's Encrypt cert automatically.

WebSocket upgrades work transparently through Traefik — no extra config needed.

## 4. Register the slash commands

After the first successful deploy, exec a shell into the running container
from Dokploy's UI and run:

```sh
cd /repo/apps/server
bun run discord:register
```

This pushes `/send` and `/popshot-link` to the guild. Subsequent code changes
to those commands only need this step re-run if the schema changes.

## 5. Point the desktop client at the relay

The relay URL is **hardcoded** in the release build at
`wss://popshot.zetsumei.xyz/ws` — make sure your Dokploy domain matches.
(In dev builds it falls back to `ws://localhost:3000/ws` or
`$POPSHOT_RELAY_URL`.) To change the production URL, edit
`apps/web/src-tauri/src/lib.rs` and rebuild.

In the Popshot desktop app **Settings** window each pote configures:

- **Client ID**: a unique identifier per recipient (e.g. `alice-laptop`)
- **Shared Key**: the same `SHARED_KEY` you set on the server

Save, restart the app. In Discord, the recipient runs once:

```text
/popshot-link client-id:alice-laptop
```

…and they are now reachable via `/send target:@alice`.

## 6. Smoke test

```sh
curl -X POST https://relay.example.com/test/display \
  -H 'Content-Type: application/json' \
  -H "X-Shared-Key: <YOUR_SHARED_KEY>" \
  -d '{
    "text": "hello from prod",
    "duration": 6,
    "media": {
      "url": "https://picsum.photos/seed/prod/720/480",
      "mime": "image/jpeg", "size": 0, "filename": "smoke.jpg"
    }
  }'
```

Every connected client should display the overlay. Check `/health` for the
list of currently connected client IDs.
