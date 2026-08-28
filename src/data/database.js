const { Pool } = require("pg");

if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL para conectar PostgreSQL");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const EVENT_TYPES = new Set(["message", "command", "moderation", "warn", "member_join", "member_leave"]);
const DASHBOARD_PANELS = Object.freeze(["overview", "customizer", "welcome"]);
const DEFAULT_SETTINGS = Object.freeze({
  customizer: { nickname: "Focus", avatarUrl: "", bannerUrl: "", accentColor: "#5865F2" },
  welcome: {
    enabled: true, channel: "general", message: "Bienvenido {user} a {server}!", format: "text",
    card: { enabled: false, font: "Inter", textColor: "#FFFFFF", backgroundColor: "#080B12", overlayOpacity: 45, backgroundImage: "", title: "{user} se unió al servidor", subtitle: "Miembro #{server.member_count}" },
    dm: { enabled: false, message: "¡Bienvenido a {server}, {user}!" }
  },
  moderation: { enabled: true, antiSpam: true, filterLinks: false, warnLimit: 3 },
  roles: { enabled: false, defaultRole: "Miembro" },
  automation: { logs: true, joinMessage: true },
  profile: { description: "", invite: "" }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_events (
      id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('message','moderation','warn','member_join','member_leave')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), metadata JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_guild_events_guild_date ON guild_events (guild_id, created_at);
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bot_heartbeats (
      bot_id TEXT PRIMARY KEY, guild_count INTEGER NOT NULL DEFAULT 0, user_count INTEGER NOT NULL DEFAULT 0, uptime_seconds INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE bot_heartbeats ADD COLUMN IF NOT EXISTS user_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE guild_events DROP CONSTRAINT IF EXISTS guild_events_event_type_check;
    ALTER TABLE guild_events ADD CONSTRAINT guild_events_event_type_check CHECK(event_type IN ('message','command','moderation','warn','member_join','member_leave'));
    CREATE TABLE IF NOT EXISTS dashboard_users (
      discord_id TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', panels JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function string(value, fallback, max) { return typeof value === "string" ? value.trim().slice(0, max) : fallback; }
function guildId(value) { const id = String(value || "").trim(); if (!id || id.length > 32) throw new Error("guildId no válido"); return id; }
function normalizeSettings(input) {
  if (!isObject(input)) throw new Error("Configuración no válida");
  const c = isObject(input.customizer) ? input.customizer : {}, w = isObject(input.welcome) ? input.welcome : {}, card = isObject(w.card) ? w.card : {}, dm = isObject(w.dm) ? w.dm : {}, m = isObject(input.moderation) ? input.moderation : {}, r = isObject(input.roles) ? input.roles : {}, a = isObject(input.automation) ? input.automation : {}, p = isObject(input.profile) ? input.profile : {};
  const limit = Number(m.warnLimit);
  const safeUrl = (value) => { const result = string(value, "", 500); return /^https:\/\//i.test(result) ? result : ""; };
  const color = /^#[0-9a-f]{6}$/i.test(c.accentColor || "") ? c.accentColor.toUpperCase() : DEFAULT_SETTINGS.customizer.accentColor;
  const cardImage = string(card.backgroundImage, "", 6_000_000);
  const safeCardImage = /^https:\/\//i.test(cardImage) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(cardImage) ? cardImage : "";
  const cardColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value.toUpperCase() : fallback;
  const overlayOpacity = Math.min(90, Math.max(0, Number(card.overlayOpacity) || 0));
  const font = ["Inter", "Poppins", "Montserrat", "Roboto", "Serif", "Monospace"].includes(card.font) ? card.font : "Inter";
  return { customizer: { nickname: string(c.nickname, DEFAULT_SETTINGS.customizer.nickname, 32), avatarUrl: safeUrl(c.avatarUrl), bannerUrl: safeUrl(c.bannerUrl), accentColor: color }, welcome: { enabled: typeof w.enabled === "boolean" ? w.enabled : true, channel: string(w.channel, "general", 100), message: string(w.message, DEFAULT_SETTINGS.welcome.message, 2000), format: w.format === "embed" ? "embed" : "text", card: { enabled: Boolean(card.enabled), font, textColor: cardColor(card.textColor, "#FFFFFF"), backgroundColor: cardColor(card.backgroundColor, "#080B12"), overlayOpacity, backgroundImage: safeCardImage, title: string(card.title, DEFAULT_SETTINGS.welcome.card.title, 100), subtitle: string(card.subtitle, DEFAULT_SETTINGS.welcome.card.subtitle, 100) }, dm: { enabled: Boolean(dm.enabled), message: string(dm.message, DEFAULT_SETTINGS.welcome.dm.message, 2000) } }, moderation: { enabled: typeof m.enabled === "boolean" ? m.enabled : true, antiSpam: typeof m.antiSpam === "boolean" ? m.antiSpam : true, filterLinks: Boolean(m.filterLinks), warnLimit: Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : 3 }, roles: { enabled: Boolean(r.enabled), defaultRole: string(r.defaultRole, "Miembro", 100) }, automation: { logs: typeof a.logs === "boolean" ? a.logs : true, joinMessage: typeof a.joinMessage === "boolean" ? a.joinMessage : true }, profile: { description: string(p.description, "", 500), invite: string(p.invite, "", 200) } };
}

async function recordEvent({ guildId: id, eventType, metadata = null, createdAt = null }) {
  if (!EVENT_TYPES.has(eventType)) throw new Error("eventType no válido");
  if (metadata !== null && !isObject(metadata)) throw new Error("metadata no válida");
  const values = [guildId(id), eventType, metadata];
  const query = createdAt ? "INSERT INTO guild_events (guild_id,event_type,metadata,created_at) VALUES ($1,$2,$3,$4) RETURNING id" : "INSERT INTO guild_events (guild_id,event_type,metadata) VALUES ($1,$2,$3) RETURNING id";
  if (createdAt) values.push(new Date(createdAt));
  return (await pool.query(query, values)).rows[0];
}

async function getGuildStats(id) {
  const { rows: [stats] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE event_type='message') messages, COUNT(*) FILTER (WHERE event_type='moderation') moderation_actions, COUNT(*) FILTER (WHERE event_type='warn') warns, COUNT(*) FILTER (WHERE event_type='member_join') total_joins, COUNT(*) FILTER (WHERE event_type='member_leave') total_leaves, COUNT(*) FILTER (WHERE event_type='member_join' AND created_at >= NOW()-INTERVAL '30 days') new_members_30d FROM guild_events WHERE guild_id=$1`, [guildId(id)]);
  const changes = {};
  for (const [key, type] of Object.entries({ messages: "message", newMembers30d: "member_join", moderationActions: "moderation", warns: "warn" })) {
    const { rows: [row] } = await pool.query(`SELECT COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '30 days') current, COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '60 days' AND created_at<NOW()-INTERVAL '30 days') previous FROM guild_events WHERE guild_id=$1 AND event_type=$2`, [guildId(id), type]);
    const current = Number(row.current), previous = Number(row.previous); changes[key] = previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;
  }
  return { messages: Number(stats.messages), newMembers30d: Number(stats.new_members_30d), moderationActions: Number(stats.moderation_actions), warns: Number(stats.warns), totalJoins: Number(stats.total_joins), totalLeaves: Number(stats.total_leaves), changes };
}

async function getGuildSettings(id) { const { rows: [row] } = await pool.query("SELECT settings FROM guild_settings WHERE guild_id=$1", [guildId(id)]); return normalizeSettings(row?.settings || {}); }
async function saveGuildSettings(id, settings) { const normalized = normalizeSettings(settings), key = guildId(id); await pool.query("INSERT INTO guild_settings (guild_id,settings,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT(guild_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=NOW()", [key, normalized]); return normalized; }
async function getGuildActivity(id) { const { rows } = await pool.query("SELECT created_at::date::text date, COUNT(*) FILTER (WHERE event_type='message')::int messages, COUNT(*) FILTER (WHERE event_type='member_join')::int joins, COUNT(*) FILTER (WHERE event_type IN ('moderation','warn'))::int moderation FROM guild_events WHERE guild_id=$1 AND created_at>=NOW()-INTERVAL '7 days' GROUP BY created_at::date ORDER BY date", [guildId(id)]); return rows; }
async function recordBotHeartbeat({ botId = "focus", guildCount = 0, userCount = 0, uptimeSeconds = 0 }) { await pool.query("INSERT INTO bot_heartbeats (bot_id,guild_count,user_count,uptime_seconds,updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT(bot_id) DO UPDATE SET guild_count=EXCLUDED.guild_count,user_count=EXCLUDED.user_count,uptime_seconds=EXCLUDED.uptime_seconds,updated_at=NOW()", [string(botId, "focus", 100), Math.max(0, Number(guildCount) || 0), Math.max(0, Number(userCount) || 0), Math.max(0, Number(uptimeSeconds) || 0)]); }
async function getBotStatus(botId = "focus") { const { rows: [row] } = await pool.query("SELECT guild_count,user_count,uptime_seconds,updated_at,EXTRACT(EPOCH FROM (NOW()-updated_at)) seconds FROM bot_heartbeats WHERE bot_id=$1", [botId]); return row ? { online: Number(row.seconds) <= 90, uptime: Number(row.uptime_seconds), lastSync: row.updated_at, guildCount: Number(row.guild_count), userCount: Number(row.user_count) } : { online: false, uptime: 0, lastSync: null, guildCount: 0, userCount: 0 }; }
async function getPublicStats() { const [status, result] = await Promise.all([getBotStatus(), pool.query("SELECT COUNT(*) FILTER (WHERE event_type='command')::int commands FROM guild_events")]); return { ...status, commandCount: Number(result.rows[0]?.commands || 0) }; }

function normalizeUser({ discordId, displayName = "", panels = [] }) { const id = String(discordId || "").trim(); if (!/^\d{17,20}$/.test(id) || !Array.isArray(panels)) throw new Error("Usuario no válido"); return { discordId: id, displayName: string(displayName, "", 80), panels: [...new Set(panels.filter((panel) => DASHBOARD_PANELS.includes(panel)))] }; }
async function getDashboardUser(id) { const { rows: [row] } = await pool.query("SELECT discord_id,display_name,panels FROM dashboard_users WHERE discord_id=$1", [String(id)]); return row ? normalizeUser({ discordId: row.discord_id, displayName: row.display_name, panels: row.panels }) : null; }
async function listDashboardUsers() { const { rows } = await pool.query("SELECT discord_id,display_name,panels,updated_at FROM dashboard_users ORDER BY updated_at DESC"); return rows.map((row) => ({ ...normalizeUser({ discordId: row.discord_id, displayName: row.display_name, panels: row.panels }), updatedAt: row.updated_at })); }
async function saveDashboardUser(user) { const n = normalizeUser(user); await pool.query("INSERT INTO dashboard_users (discord_id,display_name,panels,updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT(discord_id) DO UPDATE SET display_name=EXCLUDED.display_name,panels=EXCLUDED.panels,updated_at=NOW()", [n.discordId, n.displayName, JSON.stringify(n.panels)]); return n; }
async function deleteDashboardUser(id) { return (await pool.query("DELETE FROM dashboard_users WHERE discord_id=$1", [String(id)])).rowCount > 0; }

module.exports = { initializeDatabase, recordEvent, getGuildStats, getGuildSettings, saveGuildSettings, getGuildActivity, recordBotHeartbeat, getBotStatus, getPublicStats, DASHBOARD_PANELS, getDashboardUser, listDashboardUsers, saveDashboardUser, deleteDashboardUser };
