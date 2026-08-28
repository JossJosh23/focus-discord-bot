const Database = require("better-sqlite3");

const database = new Database(process.env.DATABASE_PATH || "soniabot.sqlite");
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS guild_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('message', 'moderation', 'warn', 'member_join', 'member_leave')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_guild_events_guild_date
    ON guild_events(guild_id, created_at);
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    settings TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS bot_heartbeats (
    bot_id TEXT PRIMARY KEY,
    guild_count INTEGER NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertEvent = database.prepare(`
  INSERT INTO guild_events (guild_id, event_type, metadata)
  VALUES (@guildId, @eventType, @metadata)
`);

const EVENT_TYPES = new Set(["message", "moderation", "warn", "member_join", "member_leave"]);
const DEFAULT_SETTINGS = Object.freeze({
  welcome: { enabled: true, channel: "general", message: "Bienvenido {user} a {server}!", format: "text" },
  moderation: { enabled: true, antiSpam: true, filterLinks: false, warnLimit: 3 },
  roles: { enabled: false, defaultRole: "Miembro" },
  automation: { logs: true, joinMessage: true },
  profile: { description: "", invite: "" }
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} no válido`);
  }
  return value.trim();
}

function optionalString(value, fallback, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeSettings(settings) {
  if (!isPlainObject(settings)) throw new Error("Configuración no válida");

  const welcome = isPlainObject(settings.welcome) ? settings.welcome : {};
  const moderation = isPlainObject(settings.moderation) ? settings.moderation : {};
  const roles = isPlainObject(settings.roles) ? settings.roles : {};
  const automation = isPlainObject(settings.automation) ? settings.automation : {};
  const profile = isPlainObject(settings.profile) ? settings.profile : {};
  const warnLimit = Number(moderation.warnLimit);

  return {
    welcome: {
      enabled: typeof welcome.enabled === "boolean" ? welcome.enabled : DEFAULT_SETTINGS.welcome.enabled,
      channel: optionalString(welcome.channel, DEFAULT_SETTINGS.welcome.channel, 100),
      message: optionalString(welcome.message, DEFAULT_SETTINGS.welcome.message, 1_700),
      format: welcome.format === "embed" ? "embed" : DEFAULT_SETTINGS.welcome.format
    },
    moderation: {
      enabled: typeof moderation.enabled === "boolean" ? moderation.enabled : DEFAULT_SETTINGS.moderation.enabled,
      antiSpam: typeof moderation.antiSpam === "boolean" ? moderation.antiSpam : DEFAULT_SETTINGS.moderation.antiSpam,
      filterLinks: typeof moderation.filterLinks === "boolean" ? moderation.filterLinks : DEFAULT_SETTINGS.moderation.filterLinks,
      warnLimit: Number.isInteger(warnLimit) && warnLimit >= 1 && warnLimit <= 20 ? warnLimit : DEFAULT_SETTINGS.moderation.warnLimit
    },
    roles: {
      enabled: typeof roles.enabled === "boolean" ? roles.enabled : DEFAULT_SETTINGS.roles.enabled,
      defaultRole: optionalString(roles.defaultRole, DEFAULT_SETTINGS.roles.defaultRole, 100)
    },
    automation: {
      logs: typeof automation.logs === "boolean" ? automation.logs : DEFAULT_SETTINGS.automation.logs,
      joinMessage: typeof automation.joinMessage === "boolean" ? automation.joinMessage : DEFAULT_SETTINGS.automation.joinMessage
    },
    profile: {
      description: optionalString(profile.description, DEFAULT_SETTINGS.profile.description, 500),
      invite: optionalString(profile.invite, DEFAULT_SETTINGS.profile.invite, 200)
    }
  };
}

function recordEvent({ guildId, eventType, metadata = null, createdAt = null }) {
  const normalizedGuildId = requiredString(guildId, "guildId", 32);
  if (!EVENT_TYPES.has(eventType)) throw new Error("eventType no válido");

  let serializedMetadata = null;
  if (metadata !== null) {
    if (!isPlainObject(metadata)) throw new Error("metadata no válida");
    serializedMetadata = JSON.stringify(metadata);
    if (serializedMetadata.length > 16_000) throw new Error("metadata excede el tamaño permitido");
  }

  if (createdAt) {
    if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
      throw new Error("createdAt no válido");
    }
    return database.prepare(`
      INSERT INTO guild_events (guild_id, event_type, created_at, metadata)
      VALUES (?, ?, ?, ?)
    `).run(normalizedGuildId, eventType, new Date(createdAt).toISOString(), serializedMetadata);
  }

  return insertEvent.run({
    guildId: normalizedGuildId,
    eventType,
    metadata: serializedMetadata
  });
}

function getGuildStats(guildId) {
  // CORRECCIÓN: SUM() con CASE WHEN para 'message' en lugar de COUNT(*)
  const stats = database.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'message' THEN 1 ELSE 0 END) AS messages,
      SUM(CASE WHEN event_type = 'moderation' THEN 1 ELSE 0 END) AS moderation_actions,
      SUM(CASE WHEN event_type = 'warn' THEN 1 ELSE 0 END) AS warns,
      SUM(CASE WHEN event_type = 'member_join' THEN 1 ELSE 0 END) AS total_joins,
      SUM(CASE WHEN event_type = 'member_leave' THEN 1 ELSE 0 END) AS total_leaves,
      SUM(CASE WHEN event_type = 'member_join' AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS new_members_30d
    FROM guild_events
    WHERE guild_id = ?
  `).get(guildId);

  const activeWarns = database.prepare(`
    SELECT COUNT(*) AS count
    FROM guild_events
    WHERE guild_id = ? AND event_type = 'warn'
      AND json_extract(metadata, '$.active') IS NOT 0
  `).get(guildId).count;

  const periods = database.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS current_period,
      SUM(CASE WHEN created_at >= datetime('now', '-60 days') AND created_at < datetime('now', '-30 days') THEN 1 ELSE 0 END) AS previous_period
    FROM guild_events
    WHERE guild_id = ? AND event_type = ?
  `);

  function percentageChange(eventType) {
    const period = periods.get(guildId, eventType);
    const current = Number(period.current_period || 0);
    const previous = Number(period.previous_period || 0);
    if (!previous) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  return {
    messages: Number(stats.messages || 0),
    newMembers30d: Number(stats.new_members_30d || 0),
    moderationActions: Number(stats.moderation_actions || 0),
    warns: Number(activeWarns || stats.warns || 0),
    totalJoins: Number(stats.total_joins || 0),
    totalLeaves: Number(stats.total_leaves || 0),
    changes: {
      messages: percentageChange("message"),
      newMembers30d: percentageChange("member_join"),
      moderationActions: percentageChange("moderation"),
      warns: percentageChange("warn")
    }
  };
}

function getGuildSettings(guildId) {
  const row = database.prepare("SELECT settings FROM guild_settings WHERE guild_id = ?").get(guildId);
  if (!row) return normalizeSettings({});
  try {
    return normalizeSettings(JSON.parse(row.settings));
  } catch { return normalizeSettings({}); }
}

function saveGuildSettings(guildId, settings) {
  const normalizedGuildId = requiredString(guildId, "guildId", 32);
  const normalizedSettings = normalizeSettings(settings);
  database.prepare(`
    INSERT INTO guild_settings (guild_id, settings, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(guild_id) DO UPDATE SET settings = excluded.settings, updated_at = datetime('now')
  `).run(normalizedGuildId, JSON.stringify(normalizedSettings));
  return normalizedSettings;
}

function getGuildActivity(guildId) {
  return database.prepare(`
    SELECT substr(created_at, 1, 10) AS date,
      SUM(CASE WHEN event_type = 'message' THEN 1 ELSE 0 END) AS messages,
      SUM(CASE WHEN event_type = 'member_join' THEN 1 ELSE 0 END) AS joins,
      SUM(CASE WHEN event_type IN ('moderation', 'warn') THEN 1 ELSE 0 END) AS moderation
    FROM guild_events WHERE guild_id = ? AND created_at >= datetime('now', '-7 days')
    GROUP BY substr(created_at, 1, 10) ORDER BY date ASC
  `).all(guildId);
}

function recordBotHeartbeat({ botId = "focus", guildCount = 0, uptimeSeconds = 0 }) {
  const normalizedBotId = requiredString(String(botId), "botId", 100);
  const normalizedGuildCount = Math.max(0, Math.floor(Number(guildCount) || 0));
  const normalizedUptime = Math.max(0, Math.floor(Number(uptimeSeconds) || 0));
  database.prepare(`
    INSERT INTO bot_heartbeats (bot_id, guild_count, uptime_seconds, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(bot_id) DO UPDATE SET
      guild_count = excluded.guild_count,
      uptime_seconds = excluded.uptime_seconds,
      updated_at = datetime('now')
  `).run(normalizedBotId, normalizedGuildCount, normalizedUptime);
}

function getBotStatus(botId = "focus") {
  const heartbeat = database.prepare(`
    SELECT guild_count, uptime_seconds, updated_at,
      CAST((julianday('now') - julianday(updated_at)) * 86400 AS INTEGER) AS seconds_since_heartbeat
    FROM bot_heartbeats WHERE bot_id = ?
  `).get(botId);

  if (!heartbeat) return { online: false, uptime: 0, lastSync: null, guildCount: 0 };
  return {
    online: Number(heartbeat.seconds_since_heartbeat || 0) <= 90,
    uptime: Number(heartbeat.uptime_seconds || 0),
    lastSync: heartbeat.updated_at,
    guildCount: Number(heartbeat.guild_count || 0)
  };
}

module.exports = { recordEvent, getGuildStats, getGuildSettings, saveGuildSettings, getGuildActivity, recordBotHeartbeat, getBotStatus };
