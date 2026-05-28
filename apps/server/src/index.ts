import { env } from "@popshot/env/server";
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { startDiscordBot } from "./discord/client";
import type { DisplayPayload } from "./discord/commands/send";
import {
  dispatch,
  getClientCount,
  getClientIds,
  registerClient,
  unregisterClient,
  validateHello,
} from "./relay";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) =>
  c.json({
    ok: true,
    clients: getClientCount(),
    clientIds: getClientIds(),
    ts: Date.now(),
  }),
);

// Dev affordance: trigger a display without Discord. Auth via X-Shared-Key header.
app.post("/test/display", async (c) => {
  if (c.req.header("x-shared-key") !== env.SHARED_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = (await c.req.json()) as Partial<DisplayPayload>;
  const payload: DisplayPayload = {
    id: body.id ?? crypto.randomUUID(),
    media: body.media ?? {
      url: "https://picsum.photos/600/400",
      mime: "image/jpeg",
      size: 0,
      filename: "test.jpg",
    },
    text: body.text ?? "test display",
    duration: body.duration ?? 8,
    from: body.from ?? "test",
    targets: body.targets ?? null,
    channelId: body.channelId ?? "test",
  };
  const result = dispatch(payload);
  return c.json(result);
});

app.get(
  "/ws",
  upgradeWebSocket(() => {
    let clientId: string | null = null;
    return {
      onMessage(event, ws) {
        let parsed: unknown;
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          parsed = JSON.parse(raw);
        } catch {
          ws.send(JSON.stringify({ type: "error", reason: "invalid json" }));
          ws.close(1003, "invalid json");
          return;
        }

        if (clientId === null) {
          const result = validateHello(parsed);
          if (!result.ok) {
            ws.send(JSON.stringify({ type: "error", reason: result.reason }));
            ws.close(1008, result.reason);
            return;
          }
          const reg = registerClient(result.clientId, ws);
          if (!reg.ok) {
            ws.send(JSON.stringify({ type: "error", reason: reg.reason }));
            ws.close(1008, reg.reason);
            return;
          }
          clientId = result.clientId;
          ws.send(JSON.stringify({ type: "ack", clientId }));
          console.log(`[relay] client connected: ${clientId}`);
          return;
        }
        // Post-handshake: ignore extra client messages for now.
      },
      onClose(_event, ws) {
        if (clientId) {
          unregisterClient(clientId, ws);
          console.log(`[relay] client disconnected: ${clientId}`);
          clientId = null;
        }
      },
    };
  }),
);

void startDiscordBot({ dispatch }).catch((error) => {
  console.error("[discord] failed to start", error);
});

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
