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

module.exports = { recordEvent, getGuildStats };