const Database = require("better-sqlite3");

const database = new Database(process.env.DATABASE_PATH || "soniabot.sqlite");
database.pragma("journal_mode = WAL");
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

function recordEvent({ guildId, eventType, metadata = null, createdAt = null }) {
  if (!guildId || !["message", "moderation", "warn", "member_join", "member_leave"].includes(eventType)) {
    throw new Error("guildId o eventType no valido");
  }

  if (createdAt) {
    return database.prepare(`
      INSERT INTO guild_events (guild_id, event_type, created_at, metadata)
      VALUES (?, ?, ?, ?)
    `).run(guildId, eventType, createdAt, metadata ? JSON.stringify(metadata) : null);
  }

  return insertEvent.run({
    guildId,
    eventType,
    metadata: metadata ? JSON.stringify(metadata) : null
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
  const defaults = {
    welcome: { enabled: true, channel: "general", message: "¡Bienvenido {user} a {server}!" },
    moderation: { enabled: true, antiSpam: true, filterLinks: false, warnLimit: 3 },
    roles: { enabled: false, defaultRole: "Miembro" },
    automation: { logs: false, joinMessage: true },
    profile: { description: "", invite: "" }
  };
  if (!row) return defaults;
  try {
    const saved = JSON.parse(row.settings);
    return {
      ...defaults,
      ...saved,
      welcome: { ...defaults.welcome, ...saved.welcome },
      moderation: { ...defaults.moderation, ...saved.moderation },
      roles: { ...defaults.roles, ...saved.roles },
      automation: { ...defaults.automation, ...saved.automation },
      profile: { ...defaults.profile, ...saved.profile }
    };
  } catch { return defaults; }
}

function saveGuildSettings(guildId, settings) {
  database.prepare(`
    INSERT INTO guild_settings (guild_id, settings, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(guild_id) DO UPDATE SET settings = excluded.settings, updated_at = datetime('now')
  `).run(guildId, JSON.stringify(settings));
  return getGuildSettings(guildId);
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

function recordBotHeartbeat({ botId = "soniabot", guildCount = 0, uptimeSeconds = 0 }) {
  database.prepare(`
    INSERT INTO bot_heartbeats (bot_id, guild_count, uptime_seconds, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(bot_id) DO UPDATE SET
      guild_count = excluded.guild_count,
      uptime_seconds = excluded.uptime_seconds,
      updated_at = datetime('now')
  `).run(String(botId), Number(guildCount) || 0, Number(uptimeSeconds) || 0);
}

function getBotStatus(botId = "soniabot") {
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
