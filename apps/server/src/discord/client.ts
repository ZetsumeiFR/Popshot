import { env } from "@popshot/env/server";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";

import { handleLinkCommand } from "./commands/link";
import {
  type DisplayPayload,
  handleSendAutocomplete,
  handleSendCommand,
} from "./commands/send";
import { registerCommands } from "./register";

export type DiscordBotDeps = {
  dispatch: (payload: DisplayPayload) => { delivered: number };
};

export function createDiscordBot({ dispatch }: DiscordBotDeps): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] logged in as ${c.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === "send") {
          await handleSendAutocomplete(interaction);
        }
        return;
      }
      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case "send":
          await handleSendCommand(interaction, {
            dispatch,
            allowedChannelId: env.DISCORD_CHANNEL_ID,
          });
          break;
        case "popshot-link":
          await handleLinkCommand(interaction);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error("[discord] handler error", error);
      if (!interaction.isChatInputCommand()) return;
      if (interaction.replied || interaction.deferred) return;
      await interaction.reply({
        content: "💥 Erreur interne, voir les logs serveur.",
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  return client;
}

export async function startDiscordBot(deps: DiscordBotDeps): Promise<Client> {
  const client = createDiscordBot(deps);
  await client.login(env.DISCORD_TOKEN);
  // Register slash commands on boot so a fresh deploy is immediately usable.
  // Non-fatal: a Discord API hiccup must not take down the relay.
  try {
    await registerCommands();
  } catch (error) {
    console.error(
      "[discord] command registration failed (relay still running)",
      error,
    );
  }
  return client;
}
