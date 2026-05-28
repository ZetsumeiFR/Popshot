import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),
    DISCORD_CHANNEL_ID: z.string().min(1).optional(),
    SHARED_KEY: z.string().min(16).default("dev-key-change-me-1234567890"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
