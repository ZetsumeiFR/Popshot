import {
  listAllClientIds,
  searchTargets,
} from "@popshot/db/repositories/discord-targets";
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

export const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const MIN_DURATION = 3;
export const MAX_DURATION = 30;
export const DEFAULT_DURATION = 8;
export const MAX_TEXT_LENGTH = 200;
const MAX_EXTRA_TARGETS = 4;

export type DisplayPayload = {
  id: string;
  media: {
    url: string;
    mime: string;
    size: number;
    filename: string;
  };
  text: string | null;
  duration: number;
  from: string;
  targets: string[] | null;
  channelId: string;
};

export const sendCommand = new SlashCommandBuilder()
  .setName("send")
  .setDescription("Affiche un média en overlay chez un ou plusieurs potes")
  .addAttachmentOption((option) =>
    option
      .setName("media")
      .setDescription("Image, vidéo, audio ou gif (max 25 MB)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("to")
      .setDescription("Destinataire principal (client ID lié via /popshot-link)")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("also")
      .setDescription(
        `Destinataires en plus, séparés par des virgules (max ${MAX_EXTRA_TARGETS})`,
      )
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("Texte affiché avec le média (max 200 caractères)")
      .setMaxLength(MAX_TEXT_LENGTH),
  )
  .addIntegerOption((option) =>
    option
      .setName("duration")
      .setDescription(`Durée d'affichage en secondes (${MIN_DURATION}-${MAX_DURATION})`)
      .setMinValue(MIN_DURATION)
      .setMaxValue(MAX_DURATION),
  );

export async function handleSendAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === "to") {
    const results = await searchTargets(focused.value, 25);
    await interaction.respond(
      results.map((r) => ({
        name: formatChoiceLabel(r.clientId, r.label),
        value: r.clientId,
      })),
    );
    return;
  }

  if (focused.name === "also") {
    const raw = focused.value;
    const parts = raw.split(",").map((s) => s.trim());
    const lastToken = parts[parts.length - 1] ?? "";
    const prefix = parts.slice(0, -1).filter(Boolean);
    const results = await searchTargets(lastToken, 25);
    const alreadyPicked = new Set(prefix);
    const choices = results
      .filter((r) => !alreadyPicked.has(r.clientId))
      .slice(0, 25)
      .map((r) => {
        const combined = [...prefix, r.clientId].join(", ");
        return {
          name: truncate(combined, 100),
          value: truncate(combined, 100),
        };
      });
    await interaction.respond(choices);
    return;
  }
}

export type SendHandlerDeps = {
  dispatch: (payload: DisplayPayload) => { delivered: number };
  allowedChannelId?: string;
};

export async function handleSendCommand(
  interaction: ChatInputCommandInteraction,
  deps: SendHandlerDeps,
): Promise<void> {
  if (deps.allowedChannelId && interaction.channelId !== deps.allowedChannelId) {
    await interaction.reply({
      content: "❌ Cette commande n'est pas autorisée dans ce channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const media = interaction.options.getAttachment("media", true);
  const to = interaction.options.getString("to", true).trim();
  const alsoRaw = interaction.options.getString("also");
  const text = interaction.options.getString("text");
  const duration = interaction.options.getInteger("duration") ?? DEFAULT_DURATION;

  const extraTargets = alsoRaw
    ? alsoRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (extraTargets.length > MAX_EXTRA_TARGETS) {
    await interaction.reply({
      content: `❌ Trop de destinataires en plus (max ${MAX_EXTRA_TARGETS}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targets = Array.from(new Set([to, ...extraTargets]));

  const allLinked = new Set(await listAllClientIds());
  const unknown = targets.filter((t) => !allLinked.has(t));
  if (unknown.length > 0) {
    await interaction.reply({
      content: `❌ Client ID(s) inconnu(s) : \`${unknown.join("`, `")}\`. Le destinataire doit d'abord faire \`/popshot-link\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mime = media.contentType ?? "";
  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!isAllowed) {
    await interaction.reply({
      content: `❌ Type de fichier non supporté : \`${mime || "inconnu"}\`. Accepté : image/*, video/*, audio/*.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (media.size > MAX_FILE_SIZE) {
    await interaction.reply({
      content: `❌ Fichier trop gros : ${(media.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const payload: DisplayPayload = {
    id: crypto.randomUUID(),
    media: {
      url: media.url,
      mime,
      size: media.size,
      filename: media.name,
    },
    text: text ?? null,
    duration,
    from: interaction.user.tag,
    targets,
    channelId: interaction.channelId,
  };

  const { delivered } = deps.dispatch(payload);

  const targetList = targets.map((t) => `\`${t}\``).join(", ");
  await interaction.reply({
    content:
      delivered > 0
        ? `✅ Envoyé à ${delivered}/${targets.length} client${targets.length > 1 ? "s" : ""} (${duration}s) : ${targetList}`
        : `⚠️ Aucun des destinataires n'est connecté actuellement (${targetList}).`,
    flags: MessageFlags.Ephemeral,
  });
}

function formatChoiceLabel(clientId: string, label: string | null): string {
  if (label) return truncate(`${clientId} — ${label}`, 100);
  return truncate(clientId, 100);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
