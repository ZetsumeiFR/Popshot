import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const discordTargets = sqliteTable("discord_targets", {
  discordUserId: text("discord_user_id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type DiscordTarget = typeof discordTargets.$inferSelect;
export type NewDiscordTarget = typeof discordTargets.$inferInsert;
