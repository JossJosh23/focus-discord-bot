const statsApiUrl = process.env.SONIABOT_STATS_API_URL;
const eventToken = process.env.SONIABOT_EVENT_INGEST_TOKEN;

async function recordGuildEvent(guildId, eventType, metadata = {}) {
  if (!statsApiUrl || !eventToken) return;

  const response = await fetch(`${statsApiUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-event-token": eventToken
    },
    body: JSON.stringify({ guildId, eventType, metadata })
  });

  if (!response.ok) {
    throw new Error(`Stats API returned ${response.status}`);
  }
}

async function getWelcomeSettings(guildId) {
  if (!statsApiUrl || !eventToken) return null;

  const response = await fetch(`${statsApiUrl}/api/bot/guilds/${guildId}/welcome`, {
    headers: { "x-event-token": eventToken }
  });

  if (!response.ok) throw new Error(`Welcome settings API returned ${response.status}`);
  return (await response.json()).welcome;
}

function findWelcomeChannel(guild, configuredChannel) {
  const channelKey = String(configuredChannel || "").trim();
  if (!channelKey) return null;

  // El panel acepta el ID del canal (recomendado) o su nombre exacto.
  return guild.channels.cache.get(channelKey)
    || guild.channels.cache.find((channel) => channel.name === channelKey && channel.isTextBased());
}

async function sendWelcome(member) {
  const welcome = await getWelcomeSettings(member.guild.id);
  if (!welcome?.enabled) return;

  const channel = findWelcomeChannel(member.guild, welcome.channel);
  if (!channel?.isTextBased()) {
    throw new Error(`No se encontro el canal de bienvenida "${welcome.channel}" en ${member.guild.id}`);
  }

  const message = String(welcome.message || "Bienvenido {user} a {server}!")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name);

  await channel.send({ content: message, allowedMentions: { users: [member.id] } });
}

function registerStatsListeners(client) {
  client.on("messageCreate", (message) => {
    if (!message.author.bot && message.guildId) {
      recordGuildEvent(message.guildId, "message").catch(console.error);
    }
  });

  client.on("guildMemberAdd", (member) => {
    sendWelcome(member).catch(console.error);
    recordGuildEvent(member.guild.id, "member_join", { userId: member.id }).catch(console.error);
  });

  client.on("guildMemberRemove", (member) => {
    recordGuildEvent(member.guild.id, "member_leave", { userId: member.id }).catch(console.error);
  });
}

async function recordModerationAction(guildId, action, moderatorId, targetId) {
  await recordGuildEvent(guildId, "moderation", { action, moderatorId, targetId });
}

async function recordWarn(guildId, moderatorId, targetId, active = true) {
  await recordGuildEvent(guildId, "warn", { moderatorId, targetId, active });
}

module.exports = { registerStatsListeners, recordModerationAction, recordWarn, getWelcomeSettings, sendWelcome };
