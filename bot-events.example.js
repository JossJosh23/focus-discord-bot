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

function registerStatsListeners(client) {
  client.on("messageCreate", (message) => {
    if (!message.author.bot && message.guildId) {
      recordGuildEvent(message.guildId, "message").catch(console.error);
    }
  });

  client.on("guildMemberAdd", (member) => {
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

module.exports = { registerStatsListeners, recordModerationAction, recordWarn };
