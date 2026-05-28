import { upsertDiscordTarget } from "@popshot/db/repositories/discord-targets";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const linkCommand = new SlashCommandBuilder()
  .setName("popshot-link")
  .setDescription("Associe ton compte Discord à un client Popshot")
  .addStringOption((option) =>
    option
      .setName("client-id")
      .setDescription("Identifiant unique de ton app Popshot (ex: alice-laptop)")
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(64),
  )
  .addStringOption((option) =>
    option
      .setName("label")
      .setDescription("Étiquette pour ce client (optionnel)")
      .setMaxLength(64),
  );

export async function handleLinkCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const clientId = interaction.options.getString("client-id", true);
  const label = interaction.options.getString("label");

  if (!/^[a-zA-Z0-9_-]+$/.test(clientId)) {
    await interaction.reply({
      content:
        "❌ `client-id` doit contenir uniquement des lettres, chiffres, `-` et `_`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await upsertDiscordTarget({
      discordUserId: interaction.user.id,
      clientId,
      label,
    });
    await interaction.reply({
      content: `✅ Associé : <@${interaction.user.id}> → \`${clientId}\`${label ? ` (${label})` : ""}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("[link] upsert failed", error);
    await interaction.reply({
      content:
        "💥 Échec de l'association. Le `client-id` est peut-être déjà utilisé par un autre compte.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
