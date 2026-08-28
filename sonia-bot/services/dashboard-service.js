const { EmbedBuilder } = require("discord.js");

const statsApiUrl = (process.env.SONIABOT_STATS_API_URL || "").replace(/\/$/, "");
const eventToken = process.env.SONIABOT_EVENT_INGEST_TOKEN;
const SETTINGS_CACHE_TTL_MS = 60_000;
const settingsCache = new Map();
const recentMessages = new Map();

function isConfigured() {
  return Boolean(statsApiUrl && eventToken);
}

async function dashboardRequest(path, options = {}) {
  if (!isConfigured()) return null;

  const response = await fetch(`${statsApiUrl}${path}`, {
    ...options,
    headers: {
      "x-event-token": eventToken,
      ...options.headers
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) throw new Error(`Dashboard API returned ${response.status} for ${path}`);
  return response;
}

async function recordGuildEvent(guildId, eventType, metadata = {}) {
  const response = await dashboardRequest("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guildId, eventType, metadata })
  });
  return response?.json();
}

async function getGuildSettings(guildId, forceRefresh = false) {
  const cached = settingsCache.get(guildId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.settings;

  const response = await dashboardRequest(`/api/bot/guilds/${encodeURIComponent(guildId)}/settings`);
  if (!response) return null;
  const { settings } = await response.json();
  settingsCache.set(guildId, { settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
  return settings;
}

async function findWelcomeChannel(guild, configuredChannel) {
  const channelKey = String(configuredChannel || "").trim();
  if (!channelKey) return null;

  const cachedChannel = guild.channels.cache.get(channelKey)
    || guild.channels.cache.find((item) => item.name === channelKey && item.isTextBased());
  if (cachedChannel) return cachedChannel;

  // Un ID puede no estar en caché en servidores grandes.
  return /^\d{17,20}$/.test(channelKey)
    ? guild.channels.fetch(channelKey).catch(() => null)
    : null;
}

async function sendWelcome(member, settings) {
  const welcome = settings?.welcome;
  if (!welcome?.enabled || !settings.automation?.joinMessage) return;

  const channelKey = String(welcome.channel || "").trim();
  const channel = await findWelcomeChannel(member.guild, channelKey);

  if (!channel?.isTextBased()) {
    throw new Error(`No se encontro el canal de bienvenida "${channelKey}" en ${member.guild.name}`);
  }

  const content = String(welcome.message || "Bienvenido {user} a {server}!")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name);

  if (welcome.format === "embed") {
    const embed = new EmbedBuilder()
      .setColor(0x008CFF)
      .setDescription(content.slice(0, 4_096))
      .setFooter({ text: `Focus • ${member.guild.name}` })
      .setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { users: [member.id] } });
    return;
  }

  await channel.send({ content: content.slice(0, 2_000), allowedMentions: { users: [member.id] } });
}

async function assignDefaultRole(member, settings) {
  if (!settings?.roles?.enabled) return;

  const roleKey = String(settings.roles.defaultRole || "").trim();
  const role = member.guild.roles.cache.get(roleKey)
    || member.guild.roles.cache.find((item) => item.name === roleKey);

  if (!role || !role.editable || member.roles.cache.has(role.id)) return;
  await member.roles.add(role, "Rol automático configurado desde Focus");
}

function isSpam(message) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const timestamps = (recentMessages.get(key) || []).filter((timestamp) => now - timestamp < 10_000);
  timestamps.push(now);
  recentMessages.set(key, timestamps);
  return timestamps.length >= 6;
}

async function enforceModeration(message, settings) {
  const moderation = settings?.moderation;
  if (!moderation?.enabled || !message.deletable) return false;

  const hasLink = /(?:https?:\/\/|www\.)\S+/i.test(message.content);
  const blockedForLink = moderation.filterLinks && hasLink;
  const blockedForSpam = moderation.antiSpam && isSpam(message);
  if (!blockedForLink && !blockedForSpam) return false;

  await message.delete();
  if (settings.automation?.logs) {
    await recordGuildEvent(message.guildId, "moderation", {
      action: blockedForLink ? "auto_link_filter" : "auto_spam",
      moderatorId: null,
      targetId: message.author.id
    });
  }
  return true;
}

async function recordModerationAction(guildId, action, moderatorId, targetId = null) {
  const settings = await getGuildSettings(guildId);
  if (!settings?.automation?.logs) return null;
  return recordGuildEvent(guildId, "moderation", { action, moderatorId, targetId });
}

async function recordWarn(guildId, moderatorId, targetId) {
  const settings = await getGuildSettings(guildId);
  if (!settings?.automation?.logs) return null;
  return recordGuildEvent(guildId, "warn", { moderatorId, targetId, active: true });
}

async function sendHeartbeat(client) {
  await dashboardRequest("/api/bot/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      botId: "focus",
      guildCount: client.guilds.cache.size,
      uptimeSeconds: Math.floor((client.uptime || 0) / 1000)
    })
  });
}

function registerDashboardListeners(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guildId) return;
    try {
      const settings = await getGuildSettings(message.guildId);
      await enforceModeration(message, settings);
      if (settings?.automation?.logs) {
        await recordGuildEvent(message.guildId, "message");
      }
    } catch (error) {
      console.error("No se pudo procesar el mensaje del servidor:", error);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const settings = await getGuildSettings(member.guild.id);
      await Promise.all([assignDefaultRole(member, settings), sendWelcome(member, settings)]);
      if (settings?.automation?.logs) {
        await recordGuildEvent(member.guild.id, "member_join", { userId: member.id });
      }
    } catch (error) {
      console.error("No se pudo procesar la entrada de un miembro:", error);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    try {
      const settings = await getGuildSettings(member.guild.id);
      if (settings?.automation?.logs) {
        await recordGuildEvent(member.guild.id, "member_leave", { userId: member.id });
      }
    } catch (error) {
      console.error("No se pudo procesar la salida de un miembro:", error);
    }
  });

  client.once("ready", () => {
    sendHeartbeat(client).catch(console.error);
    const heartbeatTimer = setInterval(() => sendHeartbeat(client).catch(console.error), 45_000);
    heartbeatTimer.unref();
  });
}

module.exports = {
  registerDashboardListeners,
  recordModerationAction,
  recordWarn,
  getGuildSettings
};
