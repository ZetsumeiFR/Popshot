import { env } from "@popshot/env/server";
import { REST, Routes } from "discord.js";

import { linkCommand } from "./commands/link";
import { sendCommand } from "./commands/send";

async function main() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  const commands = [sendCommand.toJSON(), linkCommand.toJSON()];

  console.log(
    `[register] Registering ${commands.length} command(s) to guild ${env.DISCORD_GUILD_ID}...`,
  );

  const data = (await rest.put(
    Routes.applicationGuildCommands(
      env.DISCORD_CLIENT_ID,
      env.DISCORD_GUILD_ID,
    ),
    { body: commands },
  )) as unknown[];

  console.log(`[register] ✅ Registered ${data.length} command(s).`);
}

main().catch((error) => {
  console.error("[register] failed", error);
  process.exit(1);
});
