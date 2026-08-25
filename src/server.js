require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const path = require("path");
const { getGuildStats, recordEvent, getGuildSettings, saveGuildSettings, getGuildActivity, recordBotHeartbeat, getBotStatus } = require("./database");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "..", "public");

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
app.use(express.json({ limit: "32kb" }));
app.use(session({
  name: "soniabot.sid",
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
      headers: { Authorization: `${token.token_type} ${token.access_token}` }
    });

    if (!userResponse.ok) throw new Error("No se pudo obtener el usuario de Discord");
    const user = await userResponse.json();

    const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds?with_counts=true", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` }
    });

    if (!guildsResponse.ok) throw new Error("No se pudieron obtener los servidores de Discord");
    const guilds = await guildsResponse.json();

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

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  const user = {
    ...req.session.user,
    guilds: (req.session.user.guilds || []).filter(
      (guild) => Boolean(guild.owner) || hasAdministratorPermission(guild.permissions)
    )
  };
  req.session.user = user;
  res.json({ authenticated: true, user });
});

app.get("/api/guilds/:guildId/stats", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });

  const guild = (req.session.user.guilds || []).find((item) => item.id === req.params.guildId);
  if (!guild || (!guild.owner && !hasAdministratorPermission(guild.permissions))) {
    return res.status(403).json({ error: "No tienes permisos de administrador en este servidor" });
  }

  try {
    const historical = getGuildStats(req.params.guildId);
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

app.get("/api/guilds/:guildId/settings", requireManagedGuild, (req, res) => {
  res.json({ settings: getGuildSettings(req.params.guildId) });
});

app.put("/api/guilds/:guildId/settings", requireManagedGuild, (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Configuración no válida" });
  }
  res.json({ settings: saveGuildSettings(req.params.guildId, req.body) });
});

app.get("/api/guilds/:guildId/activity", requireManagedGuild, (req, res) => {
  res.json({ activity: getGuildActivity(req.params.guildId) });
});

app.get("/api/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

// Este endpoint es para el proceso del bot, no para el navegador. Solo expone
// la configuracion que necesita para dar la bienvenida a un miembro.
app.get("/api/bot/guilds/:guildId/welcome", requireBotEventToken, (req, res) => {
  const { welcome } = getGuildSettings(req.params.guildId);
  res.json({ welcome });
});

app.post("/api/events", (req, res) => {
  if (!isValidBotEventToken(req)) return res.status(401).json({ error: "Token de eventos no valido" });

  try {
    const result = recordEvent(req.body);
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/bot/heartbeat", requireBotEventToken, (req, res) => {
  const { botId, guildCount, uptimeSeconds } = req.body || {};
  recordBotHeartbeat({ botId, guildCount, uptimeSeconds });
  res.status(204).end();
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
    headers
  });
  // El usuario puede administrar un servidor al que el bot aún no fue invitado.
  // En ese caso seguimos mostrando los datos locales disponibles.
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord guild API returned ${response.status}`);
  const guild = await response.json();
  const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers });
  if (rolesResponse.status === 403 || rolesResponse.status === 404) return guild;
  if (!rolesResponse.ok) throw new Error(`Discord roles API returned ${rolesResponse.status}`);
  guild.roles = await rolesResponse.json();
  return guild;
}

function getDiscordCreationDate(snowflake) {
  const timestamp = Number((BigInt(snowflake) >> 22n) + 1420070400000n);
  return new Date(timestamp);
}

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.clearCookie("soniabot.sid").json({ ok: true }));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`SoniaBot web disponible en http://0.0.0.0:${port}`);
});
