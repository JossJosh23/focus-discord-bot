const savedUserKey = "soniabot.user";
const selectedGuildKey = "soniabot.selectedGuild";
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
const isLocalEnvironment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const mockUser = {
  username: "TheGeorgex23",
  globalName: "TheGeorgex23",
  avatarUrl: defaultAvatar,
  guilds: [
    {
      id: "mock-patriot-development",
      name: "Patriot Development",
      iconUrl: null,
      memberCount: 128,
      owner: true,
      administrator: true
    },
    {
      id: "mock-soniabot-support",
      name: "Focus Support",
      iconUrl: null,
      memberCount: 64,
      owner: false,
      administrator: true
    },
    {
      id: "mock-gaming-latino",
      name: "Gaming Latino",
      iconUrl: null,
      memberCount: 2310,
      owner: false,
      administrator: false
    }
  ]
};

const logoutButton = document.querySelector("#logoutButton");
const guildsMenu = document.querySelector("#guildsMenu");
const selectorButton = document.querySelector("#serverSelectorButton");
const selectedGuildIcon = document.querySelector("#selectedGuildIcon");
const selectedGuildName = document.querySelector("#selectedGuildName");
const navbarUserAvatar = document.querySelector("#navbarUserAvatar");
const navbarUserName = document.querySelector("#navbarUserName");
const bannerGuildIcon = document.querySelector("#bannerGuildIcon");
const bannerGuildName = document.querySelector("#bannerGuildName");
const bannerMemberCount = document.querySelector("#bannerMemberCount");
const userMenuButton = document.querySelector("#userMenuButton");
const userMenu = document.querySelector("#userMenu");
const mobileMenuButton = document.querySelector("#mobileMenuButton");
const dashboardSidebar = document.querySelector("#dashboardSidebar");
const welcomeName = document.querySelector("#welcomeName");
const serverMembers = document.querySelector("#serverMembers");
const serverRoles = document.querySelector("#serverRoles");
const serverAge = document.querySelector("#serverAge");
const currentDate = document.querySelector("#currentDate");
const currentTime = document.querySelector("#currentTime");
const dashboardGuildGrid = document.querySelector("#dashboardGuildGrid");
const guildTotalLabel = document.querySelector("#guildTotalLabel");
const statMessages = document.querySelector("#statMessages");
const statNewMembers = document.querySelector("#statNewMembers");
const statModeration = document.querySelector("#statModeration");
const statWarns = document.querySelector("#statWarns");
const statChangeElements = {
  messages: document.querySelector("#messagesChange"),
  newMembers30d: document.querySelector("#membersChange"),
  moderationActions: document.querySelector("#moderationChange"),
  warns: document.querySelector("#warnsChange")
};
let statsRequestId = 0;
let activeGuildId = null;
let guildConfiguration = null;
let guildChannels = [];

function selectGuild(guild) {
  activeGuildId = guild.id;
  localStorage.setItem(selectedGuildKey, guild.id);
  selectedGuildName.textContent = guild.name;
  selectedGuildIcon.replaceChildren();

  if (guild.iconUrl) {
    const icon = document.createElement("img");
    icon.src = guild.iconUrl;
    icon.alt = "";
    selectedGuildIcon.append(icon);
  } else {
    selectedGuildIcon.textContent = guild.name.charAt(0).toUpperCase();
  }

  bannerGuildName.textContent = guild.name;
  bannerMemberCount.textContent = Number(guild.memberCount || 0).toLocaleString();
  serverMembers.textContent = Number(guild.memberCount || 0).toLocaleString();
  serverRoles.textContent = guild.roleCount || "--";
  serverAge.textContent = guild.createdAt ? formatGuildAge(guild.createdAt) : "--";
  bannerGuildIcon.replaceChildren(createGuildIcon(guild, "banner-guild-icon"));

  document.querySelectorAll(".guild-option").forEach((option) => {
    option.setAttribute("aria-selected", option.dataset.guildId === guild.id ? "true" : "false");
  });

  guildsMenu.hidden = true;
  selectorButton.setAttribute("aria-expanded", "false");
  loadGuildStats(guild.id);
  loadGuildConfiguration(guild.id);
}

function defaultConfiguration() {
  return {
    welcome: { enabled: true, channel: "general", message: "Bienvenido {user} a {server}!", format: "text" },
    moderation: { enabled: true, antiSpam: true, filterLinks: false, warnLimit: 3 },
    roles: { enabled: false, defaultRole: "Miembro" },
    automation: { logs: true, joinMessage: true },
    profile: { description: "", invite: "" }
  };
}

async function loadGuildConfiguration(guildId) {
  try {
    if (isLocalEnvironment) {
      guildConfiguration = JSON.parse(localStorage.getItem(`soniabot.config.${guildId}`) || "null") || defaultConfiguration();
      guildChannels = [
        { id: "general", name: "general" },
        { id: "bienvenidas", name: "bienvenidas" },
        { id: "anuncios", name: "anuncios" }
      ];
    } else {
      const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/settings`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("No se pudo cargar la configuración");
      const data = await response.json();
      guildConfiguration = data.settings;
      guildChannels = Array.isArray(data.channels) ? data.channels : [];
    }
    renderManagementViews();
    loadActivity(guildId);
  } catch {
    guildConfiguration = defaultConfiguration();
    guildChannels = [];
    renderManagementViews();
  }
}

async function saveGuildConfiguration() {
  if (!activeGuildId || !guildConfiguration) return;
  if (isLocalEnvironment) {
    localStorage.setItem(`soniabot.config.${activeGuildId}`, JSON.stringify(guildConfiguration));
    showToast("Cambios guardados");
    return;
  }
  const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/settings`, {
    method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(guildConfiguration)
  });
  if (!response.ok) throw new Error("No se pudieron guardar los cambios");
  guildConfiguration = (await response.json()).settings;
  showToast("Cambios guardados");
}

function viewContent(view, content) {
  const target = document.querySelector(`[data-view="${view}"]`);
  if (target) target.innerHTML = content;
}

function renderManagementViews() {
  const c = guildConfiguration || defaultConfiguration();
  viewContent("welcome", `<section class="welcome-message-workspace"><div class="welcome-workspace-heading"><div><p class="eyebrow">Comunidad</p><h1>Bienvenidas</h1><p>Da una primera impresión increíble a cada miembro que se une a tu servidor.</p></div><span class="welcome-live-badge"><i></i> Configuración en vivo</span></div><form class="welcome-message-card" data-settings-form="community"><div class="welcome-message-card-header"><div><h2>Enviar un mensaje cuando un usuario se une al servidor</h2><p>Focus publicará el mensaje en el canal que selecciones.</p></div><label class="focus-switch" aria-label="Activar mensaje de bienvenida"><input data-config="welcome.enabled" type="checkbox" ${c.welcome.enabled ? "checked" : ""}><i></i></label></div><div class="welcome-card-divider"></div><div class="welcome-channel-field"><label><span>Canal de mensajes de bienvenida <b>*</b></span><input data-config="welcome.channel" value="${escapeHtml(c.welcome.channel)}" placeholder="Selecciona un canal"></label><small>Selecciona uno de los canales de texto disponibles en tu servidor.</small></div><div class="welcome-message-layout"><div><div class="message-mode-tabs"><button type="button" class="active">Mensaje de texto</button><span>Entrega automática</span></div><label class="welcome-composer"><textarea data-config="welcome.message" rows="6" maxlength="1700" placeholder="Escribe un mensaje de bienvenida...">${escapeHtml(c.welcome.message)}</textarea><small><span>Variables: <code>{user}</code> y <code>{server}</code></span><b id="welcomeMessageCount">${c.welcome.message.length} / 1700</b></small></label></div><aside class="welcome-preview"><p>VISTA PREVIA</p><div class="welcome-preview-message"><span class="preview-bot-avatar">F</span><div><strong>Focus <small>BOT</small></strong><p id="welcomePreviewMessage">${escapeHtml(c.welcome.message).replaceAll("{user}", "@nuevo-miembro").replaceAll("{server}", escapeHtml(selectedGuildName.textContent))}</p></div></div></aside></div><div class="welcome-card-footer"><span>Los cambios se sincronizan con Focus en menos de un minuto.</span><button class="primary-button">Guardar cambios</button></div></form></section>`);
  viewContent("moderation", `<div class="dashboard-heading"><div><p class="eyebrow">Seguridad</p><h1>Moderacion</h1><p class="dashboard-subtitle">Define reglas automaticas para proteger tu comunidad.</p></div></div><form class="settings-panel" data-settings-form="moderation"><label class="form-switch"><span>Moderacion automatica</span><input name="enabled" type="checkbox" ${c.moderation.enabled ? "checked" : ""}></label><label class="form-switch"><span>Detectar spam</span><input name="antiSpam" type="checkbox" ${c.moderation.antiSpam ? "checked" : ""}></label><label class="form-switch"><span>Filtrar enlaces sospechosos</span><input name="filterLinks" type="checkbox" ${c.moderation.filterLinks ? "checked" : ""}></label><label><span>Limite de advertencias</span><input name="warnLimit" type="number" min="1" max="20" value="${c.moderation.warnLimit}"></label><button class="primary-button">Guardar reglas</button></form>`);
  viewContent("roles", `<div class="dashboard-heading"><div><p class="eyebrow">Comunidad</p><h1>Roles automaticos</h1></div></div><form class="settings-panel" data-settings-form="roles"><label><span>Rol predeterminado</span><input name="defaultRole" value="${escapeHtml(c.roles.defaultRole)}" placeholder="Miembro"></label><label class="form-switch"><span>Asignar rol al entrar</span><input name="enabled" type="checkbox" ${c.roles.enabled ? "checked" : ""}></label><button class="primary-button">Guardar roles</button></form>`);
  viewContent("automation", `<div class="dashboard-heading"><div><p class="eyebrow">Flujos</p><h1>Automatizaciones</h1></div></div><form class="settings-panel" data-settings-form="automation"><label class="form-switch"><span>Registrar logs del servidor</span><input name="logs" type="checkbox" ${c.automation.logs ? "checked" : ""}></label><label class="form-switch"><span>Mensaje al unirse un miembro</span><input name="joinMessage" type="checkbox" ${c.automation.joinMessage ? "checked" : ""}></label><button class="primary-button">Guardar automatizaciones</button></form>`);
  viewContent("settings", `<div class="dashboard-heading"><div><p class="eyebrow">Preferencias</p><h1>Perfil del servidor</h1></div></div><form class="settings-panel" data-settings-form="profile"><label><span>Descripcion</span><textarea name="description" rows="3" placeholder="Describe tu comunidad">${escapeHtml(c.profile.description)}</textarea></label><label><span>Invitacion de Discord</span><input name="invite" value="${escapeHtml(c.profile.invite)}" placeholder="https://discord.gg/..." type="url"></label><button class="primary-button">Guardar perfil</button></form>`);
  viewContent("api", `<div class="dashboard-heading"><div><p class="eyebrow">Documentacion</p><h1>API y eventos</h1><p class="dashboard-subtitle">Conecta tu bot para ver actividad real en este panel.</p></div></div><div class="docs-grid"><article><h3>Registrar evento</h3><code>POST /api/events</code><p>Incluye el encabezado <code>x-event-token</code> y los campos guildId y eventType.</p></article><article><h3>Eventos disponibles</h3><p>message, member_join, member_leave, moderation y warn.</p></article><article><h3>Configuracion</h3><code>PUT /api/guilds/:id/settings</code><p>Disponible para administradores autenticados.</p></article></div>`);
  viewContent("premium", `<div class="dashboard-heading"><div><p class="eyebrow">Focus</p><h1>Premium</h1><p class="dashboard-subtitle">Planes para comunidades que necesitan mas automatizacion.</p></div></div><div class="docs-grid plans-grid"><article><h3>Gratis</h3><p>Moderacion y bienvenida esenciales.</p><strong>$0 / mes</strong></article><article class="featured-plan"><h3>Premium</h3><p>Logs avanzados, automatizaciones y soporte prioritario.</p><strong>$4.99 / mes</strong></article><article><h3>Comunidades</h3><p>Funciones a medida para servidores grandes.</p><strong>Contactanos</strong></article></div>`);
  renderWelcomeChannelSelector(c.welcome.channel);
  bindWelcomePreview();
  bindSettingsForms();
}

function renderWelcomeChannelSelector(selectedChannel) {
  const input = document.querySelector('[data-view="welcome"] [data-config="welcome.channel"]');
  if (!input || !guildChannels.length) return;

  const select = document.createElement("select");
  select.dataset.config = "welcome.channel";
  select.setAttribute("aria-label", "Canal de destino para la bienvenida");

  const channels = [...guildChannels];
  if (!channels.some((channel) => channel.id === selectedChannel || channel.name === selectedChannel)) {
    channels.unshift({ id: selectedChannel, name: `Canal actual: ${selectedChannel}` });
  }

  channels.forEach((channel) => {
    const option = document.createElement("option");
    option.value = channel.id;
    option.textContent = `# ${channel.name}`;
    option.selected = channel.id === selectedChannel || channel.name === selectedChannel;
    select.append(option);
  });

  input.replaceWith(select);
  const helpText = select.closest("label")?.querySelector("small");
  if (helpText) helpText.textContent = "Solo se muestran canales de texto donde Focus puede publicar mensajes.";
}

function bindWelcomePreview() {
  const composer = document.querySelector('[data-view="welcome"] [data-config="welcome.message"]');
  const preview = document.querySelector("#welcomePreviewMessage");
  const counter = document.querySelector("#welcomeMessageCount");
  if (!composer || !preview || !counter) return;

  const form = composer.closest("form");
  const modeTabs = form.querySelector(".message-mode-tabs");
  const formatInput = document.createElement("input");
  formatInput.type = "hidden";
  formatInput.dataset.config = "welcome.format";
  formatInput.value = guildConfiguration.welcome.format || "text";
  modeTabs.replaceChildren(formatInput);

  [
    ["text", "Mensaje de texto"],
    ["embed", "Mensaje embed"]
  ].forEach(([format, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("active", formatInput.value === format);
    button.addEventListener("click", () => {
      formatInput.value = format;
      modeTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      form.querySelector(".welcome-preview")?.classList.toggle("embed-preview", format === "embed");
    });
    modeTabs.append(button);
  });
  form.querySelector(".welcome-preview")?.classList.toggle("embed-preview", formatInput.value === "embed");

  const updatePreview = () => {
    const guildName = selectedGuildName.textContent || "tu servidor";
    preview.textContent = composer.value
      .replaceAll("{user}", "@nuevo-miembro")
      .replaceAll("{server}", guildName);
    counter.textContent = `${composer.value.length} / 1700`;
  };
  composer.addEventListener("input", updatePreview);

  const footer = form.querySelector(".welcome-card-footer");
  const saveButton = footer?.querySelector(".primary-button");
  if (!footer || !saveButton) return;
  const testButton = document.createElement("button");
  testButton.type = "button";
  testButton.className = "welcome-test-button";
  testButton.textContent = "Enviar prueba a Discord";
  testButton.addEventListener("click", async () => {
    applyCommunitySettings(form);
    if (isLocalEnvironment) {
      showToast("Modo local: configura el bot para enviar una prueba real");
      return;
    }

    testButton.disabled = true;
    testButton.textContent = "Enviando prueba...";
    try {
      await saveGuildConfiguration();
      const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/welcome/test`, {
        method: "POST",
        credentials: "same-origin"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo enviar la prueba");
      showToast(`Prueba enviada a #${data.channel.name}`);
    } catch (error) {
      showToast(error.message || "No se pudo enviar la prueba", true);
    } finally {
      testButton.disabled = false;
      testButton.textContent = "Enviar prueba a Discord";
    }
  });
  footer.insertBefore(testButton, saveButton);
}

function applyCommunitySettings(form) {
  form.closest(".welcome-message-workspace").querySelectorAll("[data-config]").forEach((input) => {
    const [section, property] = input.dataset.config.split(".");
    if (!section || !property || !guildConfiguration[section]) return;
    guildConfiguration[section][property] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  const welcomeToggle = form.querySelector('[data-config="welcome.enabled"]');
  if (welcomeToggle) guildConfiguration.automation.joinMessage = welcomeToggle.checked;
}

function bindSettingsForms() {
  document.querySelectorAll("[data-settings-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const key = form.dataset.settingsForm;
      if (key === "community") {
        applyCommunitySettings(form);
        try { await saveGuildConfiguration(); renderManagementViews(); } catch { showToast("No se pudieron guardar los cambios", true); }
        return;
      }
      const next = {};
      form.querySelectorAll("input, textarea").forEach((input) => { next[input.name] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value.trim(); });
      guildConfiguration[key] = { ...guildConfiguration[key], ...next };
      try { await saveGuildConfiguration(); } catch { showToast("No se pudieron guardar los cambios", true); }
    });
  });
}

async function loadActivity(guildId) {
  const target = document.querySelector("[data-view=logs]");
  if (!target) return;
  let activity = [];
  try {
    if (!isLocalEnvironment) {
      const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/activity`, { credentials: "same-origin" });
      if (response.ok) activity = (await response.json()).activity;
    }
    const max = Math.max(1, ...activity.map((day) => Number(day.messages) + Number(day.joins) + Number(day.moderation)));
    const bars = activity.length ? activity.map((day) => `<div class="activity-bar" title="${escapeHtml(day.date)}"><span style="height:${Math.max(8, ((Number(day.messages) + Number(day.joins) + Number(day.moderation)) / max) * 100)}%"></span><small>${day.date.slice(5)}</small></div>`).join("") : `<p class="empty-state">Aun no hay eventos. Conecta el endpoint de eventos de Focus para llenar este grafico.</p>`;
    target.innerHTML = `<div class="dashboard-heading"><div><p class="eyebrow">Actividad</p><h1>Webhooks y logs</h1><p class="dashboard-subtitle">Actividad de los ultimos 7 dias.</p></div></div><div class="activity-card"><div class="activity-chart">${bars}</div></div>`;
  } catch { /* The view stays available even if activity cannot be fetched. */ }
}

function escapeHtml(value = "") { const element = document.createElement("div"); element.textContent = value; return element.innerHTML; }
function showToast(message, isError = false) { const toast = document.createElement("div"); toast.className = `dashboard-toast${isError ? " error" : ""}`; toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 2800); }

function setStatsLoading(isLoading) {
  [serverMembers, serverRoles, serverAge, bannerMemberCount, statMessages, statNewMembers, statModeration, statWarns]
    .forEach((element) => {
      if (element) {
        element.textContent = isLoading ? "..." : element.textContent;
        element.classList.toggle("is-loading", isLoading);
      }
    });
}

function renderGuildStats(data) {
  const guild = data.guild;
  const stats = data.stats;
  serverMembers.textContent = Number(guild.memberCount || 0).toLocaleString();
  serverRoles.textContent = guild.roleCount ?? "--";
  serverAge.textContent = guild.createdAt ? formatGuildAge(guild.createdAt) : "--";
  bannerMemberCount.textContent = Number(guild.memberCount || 0).toLocaleString();
  statMessages.textContent = Number(stats.messages || 0).toLocaleString();
  statNewMembers.textContent = Number(stats.newMembers30d || 0).toLocaleString();
  statModeration.textContent = Number(stats.moderationActions || 0).toLocaleString();
  statWarns.textContent = Number(stats.warns || 0).toLocaleString();
  Object.entries(statChangeElements).forEach(([key, element]) => {
    if (!element) return;
    const change = stats.changes?.[key];
    const hasHistory = Number.isFinite(change);
    element.textContent = hasHistory ? `${change >= 0 ? "+" : ""}${change}%` : "Sin histórico";
    element.className = `metric-change ${hasHistory ? (change >= 0 ? "positive" : "negative") : ""}`;
  });
  setStatsLoading(false);
}

async function loadGuildStats(guildId) {
  const requestId = ++statsRequestId;
  setStatsLoading(true);

  if (isLocalEnvironment) {
    renderGuildStats({
      guild: { memberCount: 128, roleCount: 12, createdAt: "2022-01-15T00:00:00.000Z" },
      stats: { messages: 12800, newMembers30d: 246, moderationActions: 1429, warns: 38, changes: { messages: 12.5, newMembers30d: 8.2, moderationActions: -5.2, warns: -2.1 } }
    });
    return;
  }

  try {
    const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/stats`, {
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error("No se pudieron cargar las estadisticas");
    const data = await response.json();
    if (requestId === statsRequestId) renderGuildStats(data);
  } catch {
    if (requestId !== statsRequestId) return;
    [serverMembers, serverRoles, serverAge, bannerMemberCount, statMessages, statNewMembers, statModeration, statWarns]
      .forEach((element) => { if (element) element.textContent = "--"; });
    Object.values(statChangeElements).forEach((element) => {
      if (element) {
        element.textContent = "Sin datos";
        element.className = "metric-change";
      }
    });
    setStatsLoading(false);
  }
}

function formatGuildAge(createdAt) {
  const years = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 31557600000));
  return years ? `${years} año${years === 1 ? "" : "s"}` : "Nueva";
}

function updateClock() {
  const now = new Date();
  currentDate.textContent = now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  currentTime.textContent = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function createGuildIcon(guild, className = "guild-icon") {
  if (!guild.iconUrl) {
    const placeholder = document.createElement("span");
    placeholder.className = `${className} guild-icon-placeholder`;
    placeholder.textContent = guild.name.charAt(0).toUpperCase();
    return placeholder;
  }

  const icon = document.createElement("img");
  icon.className = className;
  icon.src = guild.iconUrl;
  icon.alt = "";
  return icon;
}

function renderGuilds(guilds) {
  guilds = guilds.filter((guild) => guild.owner || guild.administrator || hasAdministratorPermission(guild.permissions));
  guildsMenu.replaceChildren();
  dashboardGuildGrid.replaceChildren();
  guildTotalLabel.textContent = `${guilds.length} servidor${guilds.length === 1 ? "" : "es"}`;

  if (!guilds.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No perteneces a ningún servidor que puedas administrar.";
    dashboardGuildGrid.append(emptyMessage);
    selectedGuildName.textContent = "Sin servidores";
    selectorButton.disabled = true;
    return;
  }

  const search = document.createElement("input");
  search.className = "guild-search";
  search.type = "search";
  search.placeholder = "Buscar servidor...";
  search.setAttribute("aria-label", "Buscar servidor");
  search.addEventListener("input", () => {
    const term = search.value.toLocaleLowerCase();
    guildsMenu.querySelectorAll(".guild-option").forEach((option) => {
      option.hidden = !option.textContent.toLocaleLowerCase().includes(term);
    });
  });
  guildsMenu.append(search);

  guilds.forEach((guild) => {
    const option = document.createElement("button");
    option.className = "guild-option";
    option.type = "button";
    option.dataset.guildId = guild.id;
    option.setAttribute("role", "option");
    option.append(createGuildIcon(guild));

    const name = document.createElement("span");
    name.textContent = guild.name;
    option.append(name);

    if (guild.owner) {
      const ownerLabel = document.createElement("small");
      ownerLabel.textContent = "Propietario";
      option.append(ownerLabel);
    }

    option.addEventListener("click", () => selectGuild(guild));
    guildsMenu.append(option);

    const card = document.createElement("article");
    card.className = "dashboard-guild-card";
    card.append(createGuildIcon(guild, "dashboard-guild-card-icon"));
    const cardInfo = document.createElement("div");
    cardInfo.className = "dashboard-guild-card-info";
    const cardName = document.createElement("h3");
    cardName.textContent = guild.name;
    const cardMeta = document.createElement("p");
    cardMeta.textContent = `${Number(guild.memberCount || 0).toLocaleString()} miembros`;
    cardInfo.append(cardName, cardMeta);
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "guild-open-button";
    openButton.textContent = "Abrir";
    openButton.addEventListener("click", () => selectGuild(guild));
    card.append(cardInfo, openButton);
    dashboardGuildGrid.append(card);

  });

  const savedGuildId = localStorage.getItem(selectedGuildKey);
  const selectedGuild = guilds.find((guild) => guild.id === savedGuildId) || guilds[0];
  selectGuild(selectedGuild);
}

function hasAdministratorPermission(permissions) {
  try {
    return (BigInt(permissions || "0") & 8n) === 8n;
  } catch {
    return false;
  }
}

function renderUser(user) {
  const avatarUrl = user.avatarUrl || defaultAvatar;
  const displayName = user.globalName || user.username || "Usuario";
  navbarUserAvatar.src = avatarUrl;
  navbarUserAvatar.alt = `Avatar de ${displayName}`;
  navbarUserName.textContent = displayName;
  welcomeName.textContent = displayName;

  document.title = `${displayName} | Focus`;
}

function setupNavigation() {
  document.querySelectorAll(".sidebar-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".sidebar-link").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".dashboard-view").forEach((view) => view.classList.remove("active"));
      link.classList.add("active");
      const view = document.querySelector(`[data-view="${link.dataset.section}"]`);
      if (view) view.classList.add("active");
      dashboardSidebar.classList.remove("open");
    });
  });

  document.querySelectorAll("[data-nav-section]").forEach((link) => {
    link.addEventListener("click", () => {
      const target = document.querySelector(`.sidebar-link[data-section="${link.dataset.navSection}"]`);
      if (target) target.click();
    });
  });

  document.querySelectorAll("[data-setting]").forEach((input) => {
    const settings = JSON.parse(localStorage.getItem("soniabot.settings") || "{}");
    if (typeof settings[input.dataset.setting] === "boolean") input.checked = settings[input.dataset.setting];
    input.addEventListener("change", () => {
      const current = JSON.parse(localStorage.getItem("soniabot.settings") || "{}");
      current[input.dataset.setting] = input.checked;
      localStorage.setItem("soniabot.settings", JSON.stringify(current));
    });
  });
}

async function loadBotStatus() {
  const status = document.querySelector(".bot-status");
  if (!status || isLocalEnvironment) return;
  try {
    const response = await fetch("/api/bot/status", { credentials: "same-origin" });
    const data = await response.json();
    status.lastChild.textContent = data.online ? ` Online · sincronizado ${new Date(data.lastSync).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : " Offline";
  } catch { status.lastChild.textContent = " Estado no disponible"; }
}

async function loadDashboard() {
  try {
    if (isLocalEnvironment) {
      const storedUser = JSON.parse(localStorage.getItem(savedUserKey) || "null");
      const user = storedUser || mockUser;
      if (!storedUser) localStorage.setItem(savedUserKey, JSON.stringify(mockUser));
      renderUser(user);
      renderGuilds(Array.isArray(user.guilds) ? user.guilds : []);
      setupNavigation();
      logoutButton.hidden = false;
      return;
    }

    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) throw new Error("No autenticado");

    const { user } = await response.json();
    localStorage.setItem(savedUserKey, JSON.stringify(user));
    renderUser(user);
    renderGuilds(Array.isArray(user.guilds) ? user.guilds : []);
    setupNavigation();
    logoutButton.hidden = false;
  } catch {
    localStorage.removeItem(savedUserKey);
    window.location.replace("/");
  }
}

selectorButton.addEventListener("click", () => {
  const isOpen = selectorButton.getAttribute("aria-expanded") === "true";
  selectorButton.setAttribute("aria-expanded", String(!isOpen));
  guildsMenu.hidden = isOpen;
});

userMenuButton.addEventListener("click", () => {
  const isOpen = userMenuButton.getAttribute("aria-expanded") === "true";
  userMenuButton.setAttribute("aria-expanded", String(!isOpen));
  userMenu.hidden = isOpen;
});

mobileMenuButton.addEventListener("click", () => {
  dashboardSidebar.classList.toggle("open");
});

document.addEventListener("click", (event) => {
  if (!document.querySelector("#userDropdown").contains(event.target)) {
    userMenuButton.setAttribute("aria-expanded", "false");
    userMenu.hidden = true;
  }
  if (!document.querySelector("#serverSelector").contains(event.target)) {
    selectorButton.setAttribute("aria-expanded", "false");
    guildsMenu.hidden = true;
  }
});

logoutButton.addEventListener("click", async () => {
  if (!isLocalEnvironment) {
    await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  }
  localStorage.removeItem(savedUserKey);
  localStorage.removeItem(selectedGuildKey);
  window.location.replace("/");
});

loadDashboard();
loadBotStatus();
updateClock();
setInterval(updateClock, 60000);
