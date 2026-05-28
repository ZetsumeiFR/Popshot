import { env } from "@popshot/env/server";
import type { WSContext } from "hono/ws";

import type { DisplayPayload } from "./discord/commands/send";
import type { DisplayMessage } from "./protocol";

interface Client {
  id: string;
  ws: WSContext;
  connectedAt: number;
}

const clients = new Map<string, Client>();

export function registerClient(
  clientId: string,
  ws: WSContext,
): { ok: true } | { ok: false; reason: string } {
  const existing = clients.get(clientId);
  if (existing) {
    try {
      existing.ws.close(1000, "replaced");
    } catch {
      // ignore
    }
  }
  clients.set(clientId, { id: clientId, ws, connectedAt: Date.now() });
  return { ok: true };
}

export function unregisterClient(clientId: string, ws: WSContext): void {
  const current = clients.get(clientId);
  if (current && current.ws === ws) {
    clients.delete(clientId);
  }
}

export function dispatch(payload: DisplayPayload): { delivered: number } {
  const msg: DisplayMessage = {
    type: "display",
    id: payload.id,
    media: payload.media,
    text: payload.text,
    duration: payload.duration,
    from: payload.from,
    channelId: payload.channelId,
  };
  const data = JSON.stringify(msg);

  const targetIds = payload.targets ?? Array.from(clients.keys());

  let delivered = 0;
  for (const id of targetIds) {
    const client = clients.get(id);
    if (!client) continue;
    try {
      client.ws.send(data);
      delivered++;
    } catch (error) {
      console.error(`[relay] send to ${id} failed`, error);
    }
  }
  return { delivered };
}

export function validateHello(
  message: unknown,
): { ok: true; clientId: string } | { ok: false; reason: string } {
  if (typeof message !== "object" || message === null) {
    return { ok: false, reason: "invalid message" };
  }
  const m = message as Record<string, unknown>;
  if (m.type !== "hello")
    return { ok: false, reason: "expected hello message" };
  if (typeof m.clientId !== "string" || m.clientId.length === 0) {
    return { ok: false, reason: "invalid clientId" };
  }
  if (typeof m.sharedKey !== "string") {
    return { ok: false, reason: "missing sharedKey" };
  }
  if (m.sharedKey !== env.SHARED_KEY) {
    return { ok: false, reason: "invalid sharedKey" };
  }
  return { ok: true, clientId: m.clientId };
}

export function getClientCount(): number {
  return clients.size;
}

export function getClientIds(): string[] {
  return Array.from(clients.keys());
}
