require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} = require('discord.js');
const { registerDashboardListeners, recordModerationAction, recordWarn } = require('./api/dashboard');

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Faltan DISCORD_TOKEN o CLIENT_ID en el archivo .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

registerDashboardListeners(client);

client.commands = new Collection();

function loadCommands(directory) {
  const commandFiles = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of commandFiles) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      loadCommands(entryPath);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    const command = require(entryPath);
    if (!command.data?.name || typeof command.execute !== 'function') {
      console.warn(`Comando omitido por formato inválido: ${entryPath}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

loadCommands(path.join(__dirname, 'commands'));

client.once(Events.ClientReady, async (readyClient) => {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const commandData = client.commands.map((command) => command.data.toJSON());

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    await Promise.all(
      readyClient.guilds.cache.map((guild) =>
        rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), {
          body: commandData,
        })
      )
    );

    console.log(`Sonia está conectada como ${readyClient.user.tag}`);
    console.log(`${client.commands.size} comando(s) registrado(s) en ${readyClient.guilds.cache.size} servidor(es).`);
  } catch (error) {
    console.error('No se pudieron registrar los comandos:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);

    if (interaction.guildId && ["ban", "kick", "timeout", "lock", "unlock", "clear"].includes(interaction.commandName)) {
      const targetId = interaction.options.getUser("usuario")?.id || null;
      recordModerationAction(interaction.guildId, interaction.commandName, interaction.user.id, targetId).catch(console.error);
    }
    if (interaction.guildId && interaction.commandName === "warn") {
      const targetId = interaction.options.getUser("usuario", true).id;
      recordWarn(interaction.guildId, interaction.user.id, targetId).catch(console.error);
    }
  } catch (error) {
    console.error(`Error ejecutando /${interaction.commandName}:`, error);

    const response = {
      content: 'No pude ejecutar ese comando.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch((replyError) => {
        console.error('No se pudo enviar el error de la interacción:', replyError.message);
      });
    } else {
      await interaction.reply(response).catch((replyError) => {
        console.error('No se pudo enviar el error de la interacción:', replyError.message);
      });
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('No se pudo iniciar sesión en Discord:', error.message);
  process.exit(1);
});
