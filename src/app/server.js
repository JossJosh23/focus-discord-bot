const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const path = require("path");
const sharp = require("sharp");
const {
  initializeDatabase, getGuildStats, recordEvent, getGuildSettings, saveGuildSettings, getGuildActivity, recordBotHeartbeat, getBotStatus, getPublicStats,
  DASHBOARD_PANELS, getDashboardUser, listDashboardUsers, saveDashboardUser, deleteDashboardUser
} = require("../data/database");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "..", "..", "public");
const welcomeTestCooldowns = new Map();
const ownerIds = new Set((process.env.FOCUS_OWNER_IDS || "").split(",").map((id) => id.trim()).filter((id) => /^\d{17,20}$/.test(id)));

app.set("trust proxy", 1);

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REDIRECT_URI || !process.env.SESSION_SECRET) {
  throw new Error("Faltan CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o SESSION_SECRET en .env");
}

app.disable("x-powered-by");
app.use((_, res, next) => {
  res.set({
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  next();
});
app.use(express.json({ limit: "7mb" }));
app.use(session({
  name: "focusbot.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use("/public", express.static(publicDir));
app.use("/dashboard", express.static(path.join(publicDir, "dashboard"), { index: "index.html" }));
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "landing", "index.html")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/public/stats", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=15");
  res.json(await getPublicStats());
});

app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state || state !== req.session.oauthState) {
    return res.status(400).send("La autenticacion de Discord fue cancelada o no es valida.");
  }

  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) throw new Error("No se pudo obtener el token de Discord");
    const token = await tokenResponse.json();

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` },
      signal: AbortSignal.timeout(10_000)
    });

    if (!userResponse.ok) throw new Error("No se pudo obtener el usuario de Discord");
    const user = await userResponse.json();

    const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds?with_counts=true", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` },
      signal: AbortSignal.timeout(10_000)
    });

    if (!guildsResponse.ok) throw new Error("No se pudieron obtener los servidores de Discord");
    const guilds = await guildsResponse.json();
    const botGuildIds = await fetchBotGuildIds();

    const manageableGuilds = guilds
      .filter((guild) => Boolean(guild.owner) || hasAdministratorPermission(guild.permissions))
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        iconUrl: guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
          : null,
        owner: Boolean(guild.owner),
        administrator: hasAdministratorPermission(guild.permissions),
        botInstalled: botGuildIds.has(guild.id),
        permissions: guild.permissions,
        memberCount: guild.approximate_member_count || 0
      }));

    req.session.user = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`,
      guilds: manageableGuilds
    };

    res.redirect("/dashboard/");
  } catch (authError) {
    console.error(authError);
    res.status(502).send("No se pudo completar la autenticacion con Discord.");
  }
});

function hasAdministratorPermission(permissions) {
  try {
    return (BigInt(permissions || "0") & 8n) === 8n;
  } catch {
    return false;
  }
}

async function getDashboardAccess(discordId) {
  if (ownerIds.has(String(discordId))) {
    return { role: "owner", panels: [...DASHBOARD_PANELS], canManageUsers: true };
  }
  const user = await getDashboardUser(discordId);
  return { role: "developer", panels: user?.panels || [], canManageUsers: false };
}

function requireDashboardPanel(panel) {
  return async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ authenticated: false });
    const access = await getDashboardAccess(req.session.user.id);
    if (!access.panels.includes(panel)) return res.status(403).json({ error: "No tienes acceso a este panel" });
    req.dashboardAccess = access;
    next();
  };
}

function requireDashboardAnyPanel(panels) {
  return async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ authenticated: false });
    const access = await getDashboardAccess(req.session.user.id);
    if (!panels.some((panel) => access.panels.includes(panel))) return res.status(403).json({ error: "No tienes acceso a esta configuración" });
    req.dashboardAccess = access;
    next();
  };
}

async function requireOwner(req, res, next) {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  const access = await getDashboardAccess(req.session.user.id);
  if (!access.canManageUsers) return res.status(403).json({ error: "Solo un propietario puede administrar accesos" });
  req.dashboardAccess = access;
  next();
}

app.get("/api/me", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  const access = await getDashboardAccess(req.session.user.id);
  const user = {
    ...req.session.user,
    access,
    guilds: (req.session.user.guilds || []).filter(
      (guild) => access.panels.length > 0 && (Boolean(guild.owner) || hasAdministratorPermission(guild.permissions))
    )
  };
  req.session.user = user;
  res.json({ authenticated: true, user });
});

app.get("/api/developers", requireOwner, async (_req, res) => {
  res.json({ users: await listDashboardUsers(), panels: DASHBOARD_PANELS });
});

app.put("/api/developers/:discordId", requireOwner, async (req, res) => {
  try {
    const discordId = String(req.params.discordId || "");
    if (ownerIds.has(discordId)) return res.status(400).json({ error: "Los propietarios se administran con FOCUS_OWNER_IDS" });
    res.json({ user: await saveDashboardUser({ discordId, displayName: req.body?.displayName, panels: req.body?.panels }) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Usuario no válido" });
  }
});

app.delete("/api/developers/:discordId", requireOwner, async (req, res) => {
  if (ownerIds.has(String(req.params.discordId))) return res.status(400).json({ error: "Los propietarios se administran con FOCUS_OWNER_IDS" });
  res.json({ deleted: await deleteDashboardUser(req.params.discordId) });
});

app.get("/api/guilds/:guildId/stats", requireDashboardPanel("overview"), async (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });

  const guild = (req.session.user.guilds || []).find((item) => item.id === req.params.guildId);
  if (!guild || (!guild.owner && !hasAdministratorPermission(guild.permissions))) {
    return res.status(403).json({ error: "No tienes permisos de administrador en este servidor" });
  }

  try {
    const historical = await getGuildStats(req.params.guildId);
    const discordGuild = await fetchDiscordGuild(req.params.guildId);
    const createdAt = getDiscordCreationDate(req.params.guildId);

    res.json({
      guild: {
        id: req.params.guildId,
        name: discordGuild?.name || guild.name,
        iconUrl: discordGuild?.icon
          ? `https://cdn.discordapp.com/icons/${req.params.guildId}/${discordGuild.icon}.png?size=128`
          : guild.iconUrl,
        memberCount: discordGuild?.approximate_member_count || discordGuild?.approximate_presence_count || guild.memberCount || 0,
        roleCount: Array.isArray(discordGuild?.roles) ? discordGuild.roles.length : null,
        createdAt: createdAt.toISOString()
      },
      stats: historical
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "No se pudieron obtener las estadisticas del servidor" });
  }
});

function requireManagedGuild(req, res, next) {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  const guild = (req.session.user.guilds || []).find((item) => item.id === req.params.guildId);
  if (!guild || (!guild.owner && !hasAdministratorPermission(guild.permissions))) {
    return res.status(403).json({ error: "No tienes permisos de administrador en este servidor" });
  }
  req.guild = guild;
  next();
}

app.get("/api/guilds/:guildId/settings", requireDashboardAnyPanel(["customizer", "notifications", "welcome"]), requireManagedGuild, async (req, res) => {
  const settings = await getGuildSettings(req.params.guildId);
  if (!process.env.DISCORD_BOT_TOKEN) {
    return res.json({
      settings,
      channels: [],
      channelsNotice: "Falta DISCORD_BOT_TOKEN en las variables de la aplicación web."
    });
  }

  try {
    const [channels, discordGuild] = await Promise.all([fetchDiscordGuildChannels(req.params.guildId), fetchDiscordGuild(req.params.guildId)]);
    const roles = Array.isArray(discordGuild?.roles) ? discordGuild.roles.filter((role) => role.name !== "@everyone").map((role) => ({ id: role.id, name: role.name, color: role.color })) : [];
    res.json({
      settings,
      channels,
      roles,
      channelsNotice: channels.length ? null : "Focus no encontró canales de texto. Comprueba que el bot esté invitado y pueda ver los canales."
    });
  } catch (error) {
    console.error("No se pudieron cargar los canales del servidor:", error);
    // La configuración sigue disponible aunque Discord no responda; así el
    // administrador no pierde el acceso a los ajustes existentes.
    res.json({
      settings,
      channels: [],
      channelsNotice: "Discord no permitió cargar los canales. Revisa el token y los permisos de Focus."
    });
  }
});

async function discordImageDataUri(imageUrl) {
  if (!imageUrl) return null;
  const url = new URL(imageUrl);
  const allowedHosts = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("Usa una URL de imagen alojada en Discord CDN");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Discord no pudo descargar una de las imágenes");
  const mimeType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType)) {
    throw new Error("La imagen debe ser PNG, JPG, WEBP o GIF");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 8 * 1024 * 1024) throw new Error("La imagen supera el límite de 8 MB");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error("La imagen supera el límite de 8 MB");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

app.put("/api/guilds/:guildId/settings", requireDashboardAnyPanel(["customizer", "notifications", "welcome"]), requireManagedGuild, async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Configuración no válida" });
  }
  let previous = null;
  try {
    previous = await getGuildSettings(req.params.guildId);
    const settings = await saveGuildSettings(req.params.guildId, req.body);
    const forceProfileSync = req.get("x-settings-section") === "customizer";
    const profileChanged = forceProfileSync || ["nickname", "avatarUrl", "bannerUrl"]
      .some((key) => previous.customizer[key] !== settings.customizer[key]);
    let profileSynced = !profileChanged;
    let profileError = null;

    if (profileChanged && process.env.DISCORD_BOT_TOKEN) {
      const body = {};
      if (forceProfileSync || previous.customizer.nickname !== settings.customizer.nickname) body.nick = settings.customizer.nickname || null;
      if (forceProfileSync || previous.customizer.avatarUrl !== settings.customizer.avatarUrl) body.avatar = await discordImageDataUri(settings.customizer.avatarUrl);
      if (forceProfileSync || previous.customizer.bannerUrl !== settings.customizer.bannerUrl) body.banner = await discordImageDataUri(settings.customizer.bannerUrl);
      const response = await fetch(`https://discord.com/api/v10/guilds/${req.params.guildId}/members/@me`, {
        method: "PATCH",
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      });
      profileSynced = response.ok;
      if (!response.ok) {
        const discordError = await response.json().catch(() => ({}));
        profileError = discordError.message || `Discord respondió ${response.status}`;
        throw new Error(profileError);
      }
    } else if (profileChanged) {
      throw new Error("Falta DISCORD_BOT_TOKEN en la web");
    }

    return res.json({ settings, profileSynced, profileError });
  } catch (error) {
    if (previous) await saveGuildSettings(req.params.guildId, previous).catch(console.error);
    return res.status(400).json({ error: error.message || "No se pudo actualizar el perfil del servidor" });
  }
});

app.get("/api/guilds/:guildId/activity", requireDashboardPanel("overview"), requireManagedGuild, async (req, res) => {
  res.json({ activity: await getGuildActivity(req.params.guildId) });
});

app.get("/api/bot/status", async (_req, res) => {
  res.json(await getBotStatus());
});

app.post("/api/guilds/:guildId/welcome/test", requireDashboardPanel("welcome"), requireManagedGuild, async (req, res) => {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return res.status(503).json({ error: "El token del bot no está configurado en la web" });
  }

  const cooldownKey = `${req.session.user.id}:${req.params.guildId}`;
  const lastTestAt = welcomeTestCooldowns.get(cooldownKey) || 0;
  if (Date.now() - lastTestAt < 10_000) {
    return res.status(429).json({ error: "Espera unos segundos antes de enviar otra prueba" });
  }

  try {
    const settings = await getGuildSettings(req.params.guildId);
    const channel = await resolveWelcomeChannel(req.params.guildId, settings.welcome.channel);
    if (!channel) return res.status(400).json({ error: "Selecciona un canal de texto válido para la bienvenida" });

    const result = await sendWelcomeTest({
      channelId: channel.id,
      welcome: settings.welcome,
      guildName: req.guild.name,
      username: req.session.user.globalName || req.session.user.username,
      userId: req.session.user.id,
      avatarUrl: req.session.user.avatarUrl,
      memberCount: req.guild.memberCount || 1
    });
    welcomeTestCooldowns.set(cooldownKey, Date.now());
    res.status(201).json({ ok: true, channel: { id: channel.id, name: channel.name }, ...result });
  } catch (error) {
    console.error("No se pudo enviar la prueba de bienvenida:", error);
    res.status(502).json({ error: "Focus no pudo enviar el mensaje. Revisa sus permisos en el canal." });
  }
});

app.post("/api/guilds/:guildId/notifications/twitch/:alertId/test", requireOwner, requireManagedGuild, async (req, res) => {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return res.status(503).json({ error: "El token del bot no está configurado en la web" });
  }

  try {
    const settings = await getGuildSettings(req.params.guildId);
    const alert = settings.notifications?.twitch?.find((item) => item.id === req.params.alertId);
    if (!alert) return res.status(404).json({ error: "La alerta de Twitch no existe" });

    const channel = await resolveWelcomeChannel(req.params.guildId, alert.channelId);
    if (!channel) return res.status(400).json({ error: "El canal configurado no está disponible" });

    const streamer = alert.username || "streamer";
    const url = `https://twitch.tv/${streamer}`;
    const role = alert.roleId ? `<@&${alert.roleId}>` : "";
    const content = String(alert.message || "{role} {streamer} está en directo: {url}")
      .replaceAll("{role}", role)
      .replaceAll("{streamer}", streamer)
      .replaceAll("{title}", "Transmisión de prueba de Focus")
      .replaceAll("{game}", "Categoría de prueba")
      .replaceAll("{viewers}", "123")
      .replaceAll("{url}", url)
      .trim()
      .slice(0, 2_000);

    await discordJson(`/channels/${channel.id}/messages`, {
      content,
      embeds: [{
        color: 0x9146FF,
        author: { name: `${streamer} está en directo`, url },
        title: "🧪 Transmisión de prueba de Focus",
        url,
        description: "Esta alerta solo comprueba el canal, el rol y el formato configurado.",
        fields: [
          { name: "Categoría", value: "Categoría de prueba", inline: true },
          { name: "Espectadores", value: "123", inline: true }
        ],
        footer: { text: `Prueba interna • ${req.guild.name}` },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { roles: alert.roleId ? [alert.roleId] : [], parse: [] }
    });

    res.status(201).json({ ok: true, channel: { id: channel.id, name: channel.name } });
  } catch (error) {
    console.error("No se pudo probar la alerta de Twitch:", error);
    res.status(502).json({ error: "No se pudo enviar la prueba. Revisa los permisos de Focus en el canal." });
  }
});

// Este endpoint es para el proceso del bot, no para el navegador. Solo expone
// la configuracion que necesita para dar la bienvenida a un miembro.
app.get("/api/bot/guilds/:guildId/welcome", requireBotEventToken, async (req, res) => {
  const { welcome } = await getGuildSettings(req.params.guildId);
  res.json({ welcome });
});

// Configuración completa destinada exclusivamente al proceso del bot. El
// token de eventos impide que el navegador pueda leer estos datos directamente.
app.get("/api/bot/guilds/:guildId/settings", requireBotEventToken, async (req, res) => {
  res.json({ settings: await getGuildSettings(req.params.guildId) });
});

app.post("/api/events", async (req, res) => {
  if (!isValidBotEventToken(req)) return res.status(401).json({ error: "Token de eventos no valido" });

  try {
    const result = await recordEvent(req.body);
    res.status(201).json({ ok: true, id: result.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/bot/heartbeat", requireBotEventToken, async (req, res) => {
  const { botId, guildCount, userCount, uptimeSeconds } = req.body || {};
  try {
    await recordBotHeartbeat({ botId, guildCount, userCount, uptimeSeconds });
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function isValidBotEventToken(req) {
  return Boolean(process.env.EVENT_INGEST_TOKEN)
    && req.get("x-event-token") === process.env.EVENT_INGEST_TOKEN;
}

function requireBotEventToken(req, res, next) {
  if (!isValidBotEventToken(req)) return res.status(401).json({ error: "Token del bot no valido" });
  next();
}

async function fetchDiscordGuild(guildId) {
  if (!process.env.DISCORD_BOT_TOKEN) return null;
  const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
    headers,
    signal: AbortSignal.timeout(10_000)
  });
  // El usuario puede administrar un servidor al que el bot aún no fue invitado.
  // En ese caso seguimos mostrando los datos locales disponibles.
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord guild API returned ${response.status}`);
  const guild = await response.json();
  const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers,
    signal: AbortSignal.timeout(10_000)
  });
  if (rolesResponse.status === 403 || rolesResponse.status === 404) return guild;
  if (!rolesResponse.ok) throw new Error(`Discord roles API returned ${rolesResponse.status}`);
  guild.roles = await rolesResponse.json();
  return guild;
}

async function fetchBotGuildIds() {
  if (!process.env.DISCORD_BOT_TOKEN) return new Set();
  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return new Set();
  return new Set((await response.json()).map((guild) => guild.id));
}

async function fetchDiscordGuildChannels(guildId) {
  if (!process.env.DISCORD_BOT_TOKEN) return [];

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    signal: AbortSignal.timeout(10_000)
  });

  // El bot puede no estar instalado en un servidor que el usuario administra.
  if (response.status === 403 || response.status === 404) return [];
  if (!response.ok) throw new Error(`Discord channels API returned ${response.status}`);

  const channels = await response.json();
  return channels
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }))
    .sort((first, second) => first.name.localeCompare(second.name, "es"));
}

async function resolveWelcomeChannel(guildId, channelKey) {
  const channels = await fetchDiscordGuildChannels(guildId);
  return channels.find((channel) => channel.id === channelKey || channel.name === channelKey) || null;
}

function replaceWelcomeTestVariables(value, { guildName, username, memberCount }) {
  return String(value || "")
    .replaceAll("{user}", `@${username}`)
    .replaceAll("{server}", guildName)
    .replaceAll("{server.member_count}", String(memberCount));
}

function escapeWelcomeSvg(value) {
  return String(value || "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

async function welcomeImageDataUri(source) {
  if (!source) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return source;
  if (!/^https:\/\//i.test(source)) return "";
  const response = await fetch(source, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`No se pudo descargar la imagen (${response.status})`);
  const type = String(response.headers.get("content-type") || "image/png").split(";")[0];
  return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

async function renderWelcomeTestCard(card, variables, avatarUrl) {
  const [avatar, background] = await Promise.all([welcomeImageDataUri(avatarUrl), welcomeImageDataUri(card.backgroundImage)]);
  const opacity = Math.min(90, Math.max(0, Number(card.overlayOpacity) || 0)) / 100;
  const font = ["Inter", "Poppins", "Montserrat", "Roboto"].includes(card.font)
    ? `${card.font}, Arial, sans-serif`
    : card.font === "Monospace" ? "monospace" : "Georgia, serif";
  const textColor = /^#[0-9a-f]{6}$/i.test(card.textColor || "") ? card.textColor : "#FFFFFF";
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(card.backgroundColor || "") ? card.backgroundColor : "#080B12";
  const title = replaceWelcomeTestVariables(card.title || "{user} se unió al servidor", variables);
  const subtitle = replaceWelcomeTestVariables(card.subtitle || "Miembro #{server.member_count}", variables);
  const backgroundLayer = background
    ? `<image href="${background}" width="1000" height="500" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="1000" height="500" fill="${backgroundColor}"/>`;
  const svg = `<svg width="1000" height="500" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="avatar"><circle cx="500" cy="185" r="82"/></clipPath></defs>${backgroundLayer}<rect width="1000" height="500" fill="#000" opacity="${opacity}"/>${avatar ? `<image href="${avatar}" x="418" y="103" width="164" height="164" clip-path="url(#avatar)" preserveAspectRatio="xMidYMid slice"/>` : ""}<circle cx="500" cy="185" r="84" fill="none" stroke="${textColor}" stroke-width="5"/><text x="500" y="330" text-anchor="middle" fill="${textColor}" font-family="${escapeWelcomeSvg(font)}" font-size="42" font-weight="700">${escapeWelcomeSvg(title)}</text><text x="500" y="380" text-anchor="middle" fill="${textColor}" opacity=".78" font-family="${escapeWelcomeSvg(font)}" font-size="25">${escapeWelcomeSvg(subtitle)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function discordJson(endpoint, body) {
  const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    const error = new Error(`Discord API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function sendWelcomeTest({ channelId, welcome, guildName, username, userId, avatarUrl, memberCount }) {
  const variables = { guildName, username, memberCount };
  const result = { messageSent: false, cardSent: false, dmSent: false, warnings: [] };

  if (welcome.enabled) {
    const message = replaceWelcomeTestVariables(welcome.message || "Bienvenido {user} a {server}!", variables);
    const body = welcome.format === "embed"
      ? { embeds: [{ color: 0x008CFF, description: message.slice(0, 4_096), footer: { text: `Focus • Prueba en ${guildName}` }, timestamp: new Date().toISOString() }], allowed_mentions: { parse: [] } }
      : { content: `🧪 **Prueba de bienvenida**\n${message.slice(0, 1_900)}`, allowed_mentions: { parse: [] } };
    await discordJson(`/channels/${channelId}/messages`, body);
    result.messageSent = true;
  }

  if (welcome.card?.enabled) {
    try {
      const png = await renderWelcomeTestCard(welcome.card, variables, avatarUrl);
      const form = new FormData();
      form.append("payload_json", JSON.stringify({ content: "🧪 **Prueba de tarjeta de bienvenida**" }));
      form.append("files[0]", new Blob([png], { type: "image/png" }), "bienvenida-prueba.png");
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error(`Discord image API returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
      result.cardSent = true;
    } catch (error) {
      console.error("No se pudo generar la tarjeta de prueba:", error);
      result.warnings.push("No se pudo generar o adjuntar la tarjeta de bienvenida.");
    }
  }

  if (welcome.dm?.enabled) {
    try {
      const dm = await discordJson("/users/@me/channels", { recipient_id: userId });
      const content = replaceWelcomeTestVariables(welcome.dm.message || "¡Bienvenido a {server}, {user}!", variables).slice(0, 2_000);
      await discordJson(`/channels/${dm.id}/messages`, { content, allowed_mentions: { parse: [] } });
      result.dmSent = true;
    } catch (error) {
      console.warn(`No se pudo enviar el DM de prueba a ${userId}:`, error.message);
      result.warnings.push("Discord bloqueó el mensaje privado. Activa los mensajes directos de miembros del servidor.");
    }
  }

  if (!result.messageSent && !result.cardSent && !result.dmSent) throw new Error("No hay ningún mensaje de bienvenida activado");
  return result;
}

function getDiscordCreationDate(snowflake) {
  const timestamp = Number((BigInt(snowflake) >> 22n) + 1420070400000n);
  return new Date(timestamp);
}

app.post("/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: "No se pudo cerrar la sesión" });
    return res.clearCookie("focusbot.sid").json({ ok: true });
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "JSON no válido" });
  }
  console.error(error);
  return res.status(500).json({ error: "Error interno del servidor" });
});

initializeDatabase()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`Focus web disponible en http://0.0.0.0:${port}`)))
  .catch((error) => { console.error("No se pudo conectar a PostgreSQL:", error); process.exit(1); });
