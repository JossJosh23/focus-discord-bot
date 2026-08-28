const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const sharp = require("sharp");

const statsApiUrl = (process.env.FOCUS_BOT_STATS_API_URL || "").replace(/\/$/, "");
const eventToken = process.env.FOCUS_BOT_EVENT_INGEST_TOKEN;
const SETTINGS_CACHE_TTL_MS = 60_000;
const settingsCache = new Map();
const recentMessages = new Map();
const twitchLiveStreams = new Map();
let twitchToken = null;

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

function welcomeVariables(value, member) {
  return String(value || "")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{server.member_count}", String(member.guild.memberCount || 0));
}

function xml(value) {
  return String(value || "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

async function imageDataUri(source) {
  if (!source) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return source;
  const response = await fetch(source, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return "";
  const type = String(response.headers.get("content-type") || "image/png").split(";")[0];
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${type};base64,${buffer.toString("base64")}`;
}

async function renderWelcomeCard(member, card) {
  const avatar = await imageDataUri(member.displayAvatarURL({ extension: "png", size: 256 }));
  const background = await imageDataUri(card.backgroundImage);
  const overlay = Math.round((Math.min(90, Math.max(0, Number(card.overlayOpacity) || 0)) / 100) * 255).toString(16).padStart(2, "0");
  const fontFamily = ["Inter", "Poppins", "Montserrat", "Roboto"].includes(card.font) ? `${card.font}, Arial, sans-serif` : card.font === "Monospace" ? "monospace" : "Georgia, serif";
  const title = welcomeVariables(card.title, member).replaceAll(`<@${member.id}>`, member.displayName);
  const subtitle = welcomeVariables(card.subtitle, member).replaceAll(`<@${member.id}>`, member.displayName);
  const backgroundLayer = background ? `<image href="${background}" width="1000" height="500" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="1000" height="500" fill="${card.backgroundColor}"/>`;
  const svg = `<svg width="1000" height="500" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="avatar"><circle cx="500" cy="185" r="82"/></clipPath></defs>${backgroundLayer}<rect width="1000" height="500" fill="#000000${overlay}"/>${avatar ? `<image href="${avatar}" x="418" y="103" width="164" height="164" clip-path="url(#avatar)" preserveAspectRatio="xMidYMid slice"/>` : ""}<circle cx="500" cy="185" r="84" fill="none" stroke="${card.textColor}" stroke-width="5"/><text x="500" y="330" text-anchor="middle" fill="${card.textColor}" font-family="${xml(fontFamily)}" font-size="42" font-weight="700">${xml(title)}</text><text x="500" y="380" text-anchor="middle" fill="${card.textColor}" opacity=".78" font-family="${xml(fontFamily)}" font-size="25">${xml(subtitle)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sendWelcome(member, settings) {
  const welcome = settings?.welcome;
  if (!welcome) return;

  if (welcome.dm?.enabled) {
    const dmContent = welcomeVariables(welcome.dm.message, member).slice(0, 2_000);
    await member.send({ content: dmContent, allowedMentions: { users: [member.id] } }).catch((error) => {
      console.warn(`No se pudo enviar el DM de bienvenida a ${member.user.tag}: ${error.message}`);
    });
  }

  const sendPublicMessage = welcome.enabled && settings.automation?.joinMessage;
  const sendCard = welcome.card?.enabled;
  if (!sendPublicMessage && !sendCard) return;

  const channelKey = String(welcome.channel || "").trim();
  const channel = await findWelcomeChannel(member.guild, channelKey);

  if (!channel?.isTextBased()) {
    throw new Error(`No se encontro el canal de bienvenida "${channelKey}" en ${member.guild.name}`);
  }

  const content = welcomeVariables(welcome.message || "Bienvenido {user} a {server}!", member);

  if (sendPublicMessage && welcome.format === "embed") {
    const customizer = settings.customizer || {};
    const accentColor = /^#[0-9a-f]{6}$/i.test(customizer.accentColor || "")
      ? Number.parseInt(customizer.accentColor.slice(1), 16)
      : 0x008CFF;
    const embed = new EmbedBuilder()
      .setColor(accentColor)
      .setDescription(content.slice(0, 4_096))
      .setFooter({ text: `Focus • ${member.guild.name}` })
      .setTimestamp();
    if (customizer.avatarUrl) embed.setThumbnail(customizer.avatarUrl);
    if (customizer.bannerUrl) embed.setImage(customizer.bannerUrl);
    await channel.send({ embeds: [embed], allowedMentions: { users: [member.id] } });
  } else if (sendPublicMessage) {
    await channel.send({ content: content.slice(0, 2_000), allowedMentions: { users: [member.id] } });
  }

  if (sendCard) {
    try {
      const image = await renderWelcomeCard(member, welcome.card);
      await channel.send({ files: [new AttachmentBuilder(image, { name: `bienvenida-${member.id}.png` })] });
    } catch (error) {
      console.error(`No se pudo generar la tarjeta de bienvenida en ${member.guild.name}:`, error);
    }
  }
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
  return recordGuildEvent(guildId, "moderation", { action, moderatorId, targetId });
}

async function recordWarn(guildId, moderatorId, targetId) {
  return recordGuildEvent(guildId, "warn", { moderatorId, targetId, active: true });
}

async function recordCommand(guildId, commandName, userId) {
  return recordGuildEvent(guildId, "command", { commandName, userId });
}

async function sendHeartbeat(client) {
  await dashboardRequest("/api/bot/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      botId: "focus",
      guildCount: client.guilds.cache.size,
      userCount: client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0),
      uptimeSeconds: Math.floor((client.uptime || 0) / 1000)
    })
  });
}

async function getTwitchToken() {
  if (twitchToken?.expiresAt > Date.now() + 60_000) return twitchToken.value;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const response = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Twitch OAuth respondió ${response.status}`);
  const data = await response.json();
  twitchToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return twitchToken.value;
}

function twitchMessage(template, alert, stream) {
  const role = alert.roleId ? `<@&${alert.roleId}>` : "";
  const url = `https://twitch.tv/${stream.user_login}`;
  return String(template || "{role} {streamer} está en directo: {url}")
    .replaceAll("{role}", role).replaceAll("{streamer}", stream.user_name)
    .replaceAll("{title}", stream.title || "Directo en Twitch").replaceAll("{game}", stream.game_name || "Sin categoría")
    .replaceAll("{viewers}", String(stream.viewer_count || 0)).replaceAll("{url}", url).trim();
}

async function checkTwitchAlerts(client) {
  const accessToken = await getTwitchToken();
  if (!accessToken) return;
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id, true);
    const alerts = (settings?.notifications?.twitch || []).filter((alert) => alert.enabled);
    if (!alerts.length) continue;
    const params = new URLSearchParams();
    [...new Set(alerts.map((alert) => alert.username))].forEach((username) => params.append("user_login", username));
    const response = await fetch(`https://api.twitch.tv/helix/streams?${params}`, { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) { if (response.status === 401) twitchToken = null; throw new Error(`Twitch API respondió ${response.status}`); }
    const streams = new Map((await response.json()).data.map((stream) => [stream.user_login.toLowerCase(), stream]));
    for (const alert of alerts) {
      const key = `${guild.id}:${alert.username}`;
      const stream = streams.get(alert.username);
      if (!stream) { twitchLiveStreams.delete(key); continue; }
      if (twitchLiveStreams.get(key) === stream.id) continue;
      const channel = guild.channels.cache.get(alert.channelId) || await guild.channels.fetch(alert.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const url = `https://twitch.tv/${stream.user_login}`;
      const embed = new EmbedBuilder().setColor(0x9146FF).setAuthor({ name: `${stream.user_name} está en directo`, url }).setTitle(stream.title || "Directo en Twitch").setURL(url).addFields({ name: "Categoría", value: stream.game_name || "Sin categoría", inline: true }, { name: "Espectadores", value: String(stream.viewer_count || 0), inline: true }).setImage(stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720") + `?t=${Date.now()}`).setTimestamp(new Date(stream.started_at));
      await channel.send({ content: twitchMessage(alert.message, alert, stream).slice(0, 2_000), embeds: [embed], allowedMentions: { roles: alert.roleId ? [alert.roleId] : [], parse: [] } });
      twitchLiveStreams.set(key, stream.id);
    }
  }
}

function registerDashboardListeners(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guildId) return;
    try {
      const settings = await getGuildSettings(message.guildId);
      await enforceModeration(message, settings);
      await recordGuildEvent(message.guildId, "message");
    } catch (error) {
      console.error("No se pudo procesar el mensaje del servidor:", error);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      // Una entrada debe usar siempre la configuración más reciente; evita
      // probar tarjetas o DMs con una versión anterior guardada en caché.
      const settings = await getGuildSettings(member.guild.id, true);
      await Promise.all([assignDefaultRole(member, settings), sendWelcome(member, settings)]);
      await recordGuildEvent(member.guild.id, "member_join", { userId: member.id });
    } catch (error) {
      console.error("No se pudo procesar la entrada de un miembro:", error);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    try {
      const settings = await getGuildSettings(member.guild.id);
      await recordGuildEvent(member.guild.id, "member_leave", { userId: member.id });
    } catch (error) {
      console.error("No se pudo procesar la salida de un miembro:", error);
    }
  });

  client.once("clientReady", () => {
    sendHeartbeat(client).catch(console.error);
    const heartbeatTimer = setInterval(() => sendHeartbeat(client).catch(console.error), 45_000);
    heartbeatTimer.unref();
    setTimeout(() => checkTwitchAlerts(client).catch(console.error), 5_000);
    const twitchTimer = setInterval(() => checkTwitchAlerts(client).catch(console.error), 60_000);
    twitchTimer.unref();
  });
}

module.exports = {
  registerDashboardListeners,
  recordModerationAction,
  recordWarn,
  recordCommand,
  getGuildSettings
};
