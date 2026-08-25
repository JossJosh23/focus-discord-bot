const statsApiUrl = (process.env.SONIABOT_STATS_API_URL || "").replace(/\/$/, "");
const eventToken = process.env.SONIABOT_EVENT_INGEST_TOKEN;

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

async function getWelcomeSettings(guildId) {
  const response = await dashboardRequest(`/api/bot/guilds/${guildId}/welcome`);
  if (!response) return null;
  return (await response.json()).welcome;
}

async function sendWelcome(member) {
  const welcome = await getWelcomeSettings(member.guild.id);
  if (!welcome?.enabled) return;

  const channelKey = String(welcome.channel || "").trim();
  const channel = member.guild.channels.cache.get(channelKey)
    || member.guild.channels.cache.find((item) => item.name === channelKey && item.isTextBased());

  if (!channel?.isTextBased()) {
    throw new Error(`No se encontro el canal de bienvenida "${channelKey}" en ${member.guild.name}`);
  }

  const content = String(welcome.message || "Bienvenido {user} a {server}!")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name);

  await channel.send({ content, allowedMentions: { users: [member.id] } });
}

async function recordModerationAction(guildId, action, moderatorId, targetId = null) {
  return recordGuildEvent(guildId, "moderation", { action, moderatorId, targetId });
}

async function recordWarn(guildId, moderatorId, targetId) {
  return recordGuildEvent(guildId, "warn", { moderatorId, targetId, active: true });
}

async function sendHeartbeat(client) {
  await dashboardRequest("/api/bot/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      botId: "soniabot",
      guildCount: client.guilds.cache.size,
      uptimeSeconds: Math.floor((client.uptime || 0) / 1000)
    })
  });
}

function registerDashboardListeners(client) {
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

  client.once("ready", () => {
    sendHeartbeat(client).catch(console.error);
    const heartbeatTimer = setInterval(() => sendHeartbeat(client).catch(console.error), 45_000);
    heartbeatTimer.unref();
  });
}

module.exports = {
  registerDashboardListeners,
  recordModerationAction,
  recordWarn
};
