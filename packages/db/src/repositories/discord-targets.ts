import { eq, like, or, sql } from "drizzle-orm";

import { db } from "../index";
import { type DiscordTarget, discordTargets } from "../schema";

export async function upsertDiscordTarget(input: {
  discordUserId: string;
  clientId: string;
  label?: string | null;
}): Promise<void> {
  await db
    .insert(discordTargets)
    .values({
      discordUserId: input.discordUserId,
      clientId: input.clientId,
      label: input.label ?? null,
    })
    .onConflictDoUpdate({
      target: discordTargets.discordUserId,
      set: { clientId: input.clientId, label: input.label ?? null },
    });
}

export async function getClientIdForDiscordUser(
  discordUserId: string,
): Promise<string | null> {
  const rows = await db
    .select({ clientId: discordTargets.clientId })
    .from(discordTargets)
    .where(eq(discordTargets.discordUserId, discordUserId))
    .limit(1);
  return rows[0]?.clientId ?? null;
}

export async function deleteDiscordTarget(
  discordUserId: string,
): Promise<void> {
  await db
    .delete(discordTargets)
    .where(eq(discordTargets.discordUserId, discordUserId));
}

export async function searchTargets(
  query: string,
  limit = 25,
): Promise<DiscordTarget[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return db.select().from(discordTargets).limit(limit);
  }
  const pattern = `%${trimmed.toLowerCase()}%`;
  return db
    .select()
    .from(discordTargets)
    .where(
      or(
        like(sql`lower(${discordTargets.clientId})`, pattern),
        like(sql`lower(${discordTargets.label})`, pattern),
      ),
    )
    .limit(limit);
}

export async function listAllClientIds(): Promise<string[]> {
  const rows = await db
    .select({ clientId: discordTargets.clientId })
    .from(discordTargets);
  return rows.map((r) => r.clientId);
}
