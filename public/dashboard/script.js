const savedUserKey = "focusbot.user";
const selectedGuildKey = "focusbot.selectedGuild";
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
const isLocalEnvironment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const mockUser = {
  username: "TheGeorgex23",
  globalName: "TheGeorgex23",
  avatarUrl: defaultAvatar,
  access: { role: "owner", panels: ["overview", "customizer", "notifications", "welcome"], canManageUsers: true },
  guilds: [
    {
      id: "mock-patriot-development",
      name: "Patriot Development",
      iconUrl: null,
      memberCount: 128,
      owner: true,
      administrator: true,
      botInstalled: true
    },
    {
      id: "mock-focusbot-support",
      name: "Focus Support",
      iconUrl: null,
      memberCount: 64,
      owner: false,
      administrator: true,
      botInstalled: true
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
const developerMenuButton = document.querySelector("#developerMenuButton");
const profileMenuButton = document.querySelector("#profileMenuButton");
const planMenuButton = document.querySelector("#planMenuButton");
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
const statsSource = document.querySelector("#statsSource");
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
let guildRoles = [];
let guildChannelsNotice = null;
let dashboardAccess = { role: "developer", panels: [], canManageUsers: false };

function applyDashboardAccess(user) {
  dashboardAccess = user.access || dashboardAccess;
  const allowedPanels = new Set(dashboardAccess.panels || []);
  document.querySelectorAll(".sidebar-link[data-section]").forEach((link) => {
    const section = link.dataset.section;
    const visible = section === "developers" ? dashboardAccess.canManageUsers : allowedPanels.has(section);
    link.hidden = !visible;
  });
  if (developerMenuButton) developerMenuButton.hidden = !dashboardAccess.canManageUsers;

  const activeLink = document.querySelector(".sidebar-link.active");
  if (activeLink?.hidden) {
    const firstVisible = document.querySelector(".sidebar-link[data-section]:not([hidden])");
    firstVisible?.click();
  }
}

function inviteBot(guild) {
  const params = new URLSearchParams({
    client_id: "1540939068693544992",
    scope: "bot applications.commands",
    permissions: "1099847265302",
    guild_id: guild.id,
    disable_guild_select: "true"
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${params}`);
}

function renderDevelopers(users = [], panels = ["overview", "customizer", "notifications", "welcome"]) {
  const target = document.querySelector("#developersContent");
  if (!target) return;
  const panelLabels = { overview: "Visión general", customizer: "Personalizador", notifications: "Notificaciones", welcome: "Bienvenidas" };
  target.innerHTML = `<div class="developer-access-panel"><form id="developerForm" class="developer-form"><div><p class="eyebrow">Nuevo acceso</p><h2>Invitar desarrollador</h2><p>Usa su ID de Discord. Podrás modificarlo más tarde.</p></div><label>Nombre de referencia<input name="displayName" maxlength="80" placeholder="Ej. Moderador técnico"></label><label>ID de Discord<input name="discordId" inputmode="numeric" pattern="\\d{17,20}" required placeholder="123456789012345678"></label><fieldset><legend>Paneles permitidos</legend>${panels.map((panel) => `<label class="developer-check"><input type="checkbox" name="panels" value="${panel}"><span>${panelLabels[panel] || panel}</span></label>`).join("")}</fieldset><button class="primary-button" type="submit">Guardar acceso</button><button class="developer-cancel" type="button" hidden>Cancelar edición</button></form><div class="developer-list"><div class="developer-list-head"><div><p class="eyebrow">Accesos activos</p><h2>Equipo autorizado</h2></div><span>${users.length} usuario${users.length === 1 ? "" : "s"}</span></div>${users.length ? users.map((user) => `<article class="developer-user" data-developer-id="${user.discordId}"><div class="developer-avatar">${escapeHtml((user.displayName || "D").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(user.displayName || "Sin nombre")}</strong><code>${user.discordId}</code></div><div class="developer-panels">${user.panels.length ? user.panels.map((panel) => `<span>${panelLabels[panel] || panel}</span>`).join("") : "<small>Sin paneles</small>"}</div><button type="button" class="developer-edit">Editar</button><button type="button" class="developer-remove">Quitar</button></article>`).join("") : "<p class=\"developer-empty\">Aún no has autorizado a nadie.</p>"}</div></div>`;

  const form = target.querySelector("#developerForm");
  const cancel = form.querySelector(".developer-cancel");
  const resetForm = () => { form.reset(); form.elements.discordId.disabled = false; form.dataset.editingId = ""; cancel.hidden = true; form.querySelector("button[type=submit]").textContent = "Guardar acceso"; };
  cancel.addEventListener("click", resetForm);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const discordId = String(form.dataset.editingId || formData.get("discordId") || "").trim();
    const panelsForUser = formData.getAll("panels");
    try {
      const response = await fetch(`/api/developers/${encodeURIComponent(discordId)}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: formData.get("displayName"), panels: panelsForUser }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el acceso");
      showToast("Acceso actualizado");
      loadDevelopers();
    } catch (error) { showToast(error.message, true); }
  });
  target.querySelectorAll(".developer-edit").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest(".developer-user").dataset.developerId;
    const user = users.find((item) => item.discordId === id);
    if (!user) return;
    form.dataset.editingId = user.discordId;
    form.elements.discordId.value = user.discordId;
    form.elements.discordId.disabled = true;
    form.elements.displayName.value = user.displayName || "";
    form.querySelectorAll('input[name="panels"]').forEach((input) => { input.checked = user.panels.includes(input.value); });
    cancel.hidden = false;
    form.querySelector("button[type=submit]").textContent = "Actualizar acceso";
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  target.querySelectorAll(".developer-remove").forEach((button) => button.addEventListener("click", async () => {
    const id = button.closest(".developer-user").dataset.developerId;
    if (!window.confirm("¿Quitar el acceso de este desarrollador?")) return;
    try {
      const response = await fetch(`/api/developers/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo quitar el acceso");
      showToast("Acceso eliminado");
      loadDevelopers();
    } catch (error) { showToast(error.message, true); }
  }));
}

async function loadDevelopers() {
  if (!dashboardAccess.canManageUsers) return;
  if (isLocalEnvironment) return renderDevelopers();
  try {
    const response = await fetch("/api/developers", { credentials: "same-origin" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudieron cargar los accesos");
    renderDevelopers(result.users, result.panels);
  } catch (error) { showToast(error.message, true); }
}

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
    customizer: { nickname: "Focus", avatarUrl: "", bannerUrl: "", accentColor: "#5865F2" },
    notifications: { twitch: [] },
    welcome: { enabled: true, channel: "general", message: "Bienvenido {user} a {server}!", format: "text", card: { enabled: false, font: "Inter", textColor: "#FFFFFF", backgroundColor: "#080B12", overlayOpacity: 45, backgroundImage: "", title: "{user} se unió al servidor", subtitle: "Miembro #{server.member_count}" }, dm: { enabled: false, message: "¡Bienvenido a {server}, {user}!" } },
    moderation: { enabled: true, antiSpam: true, filterLinks: false, warnLimit: 3 },
    roles: { enabled: false, defaultRole: "Miembro" },
    automation: { logs: true, joinMessage: true },
    profile: { description: "", invite: "" }
  };
}

async function loadGuildConfiguration(guildId) {
  try {
    if (isLocalEnvironment) {
      guildConfiguration = JSON.parse(localStorage.getItem(`focusbot.config.${guildId}`) || "null") || defaultConfiguration();
      guildChannels = [
        { id: "general", name: "general" },
        { id: "bienvenidas", name: "bienvenidas" },
        { id: "anuncios", name: "anuncios" }
      ];
      guildRoles = [{ id: "123456789012345678", name: "Directos" }, { id: "234567890123456789", name: "Notificaciones" }];
      guildChannelsNotice = null;
    } else {
      const response = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/settings`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("No se pudo cargar la configuración");
      const data = await response.json();
      guildConfiguration = data.settings;
      guildChannels = Array.isArray(data.channels) ? data.channels : [];
      guildRoles = Array.isArray(data.roles) ? data.roles : [];
      guildChannelsNotice = data.channelsNotice || null;
    }
    renderManagementViews();
    loadActivity(guildId);
  } catch {
    guildConfiguration = defaultConfiguration();
    guildChannels = [];
    guildRoles = [];
    guildChannelsNotice = "No se pudo cargar la lista de canales. Inténtalo de nuevo.";
    renderManagementViews();
  }
}

async function saveGuildConfiguration(section = "") {
  if (!activeGuildId || !guildConfiguration) return;
  if (isLocalEnvironment) {
    localStorage.setItem(`focusbot.config.${activeGuildId}`, JSON.stringify(guildConfiguration));
    showToast("Cambios guardados");
    return;
  }
  const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/settings`, {
    method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-settings-section": section }, body: JSON.stringify(guildConfiguration)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudieron guardar los cambios");
  guildConfiguration = result.settings;
  showToast(result.profileSynced === false ? (result.profileError || "Discord no pudo actualizar el perfil") : "Cambios guardados y sincronizados");
}

function viewContent(view, content) {
  const target = document.querySelector(`[data-view="${view}"]`);
  if (target) target.innerHTML = content;
}

function renderWelcomeWorkspace(c) {
  const card = c.welcome.card || defaultConfiguration().welcome.card;
  const dm = c.welcome.dm || defaultConfiguration().welcome.dm;
  return `<section class="welcome-studio">
    <div class="welcome-studio-heading"><div><p class="eyebrow">COMUNIDAD</p><h1>Bienvenidas</h1><p>Diseña la experiencia que recibirá cada persona al entrar a ${escapeHtml(selectedGuildName.textContent)}.</p></div><span class="welcome-live-badge"><i></i> Sincronización en vivo</span></div>
    <form data-settings-form="community" class="welcome-studio-form">
      <article class="welcome-module">
        <header><div><span class="module-step">01</span><h2>Mensaje de bienvenida</h2><p>Publica un mensaje automático en el canal que elijas.</p></div><label class="focus-switch"><input data-config="welcome.enabled" type="checkbox" ${c.welcome.enabled ? "checked" : ""}><i></i></label></header>
        <div class="welcome-module-body">
          <label class="welcome-field"><span>Canal de destino <b>*</b></span><input data-config="welcome.channel" value="${escapeHtml(c.welcome.channel)}" placeholder="Selecciona un canal"></label>
          <div class="welcome-editor-grid"><div class="welcome-editor"><div class="message-format-tabs"><button type="button" data-format="text" class="${c.welcome.format === "text" ? "active" : ""}">Mensaje de texto</button><button type="button" data-format="embed" class="${c.welcome.format === "embed" ? "active" : ""}">Mensaje embed</button><input type="hidden" data-config="welcome.format" value="${escapeHtml(c.welcome.format)}"></div><div class="variable-chips"><span>Insertar variable</span><button type="button" data-variable="{user}">{user}</button><button type="button" data-variable="{server}">{server}</button><button type="button" data-variable="{server.member_count}">{server.member_count}</button></div><label class="welcome-composer"><textarea data-config="welcome.message" rows="7" maxlength="2000">${escapeHtml(c.welcome.message)}</textarea><small><span>El mensaje se actualiza en la vista previa.</span><b id="welcomeMessageCount">${c.welcome.message.length} / 2000</b></small></label></div><aside class="discord-message-preview"><p>VISTA PREVIA</p><div><span class="preview-bot-avatar">F</span><section><strong>Focus <small>APP</small></strong><p id="welcomePreviewMessage"></p></section></div></aside></div>
        </div>
      </article>
      <article class="welcome-module welcome-card-module">
        <header><div><span class="module-step">02</span><h2>Tarjeta de bienvenida</h2><p>Genera una imagen personalizada para cada nuevo miembro.</p></div><label class="focus-switch"><input data-config="welcome.card.enabled" type="checkbox" ${card.enabled ? "checked" : ""}><i></i></label></header>
        <div class="welcome-card-layout"><div class="welcome-canvas" id="welcomeCardPreview" style="--card-bg:${escapeHtml(card.backgroundColor)};--card-text:${escapeHtml(card.textColor)};--card-overlay:${Number(card.overlayOpacity) / 100};--card-font:${escapeHtml(card.font)}"><img class="welcome-canvas-bg" ${card.backgroundImage ? `src="${escapeHtml(card.backgroundImage)}"` : "hidden"} alt=""><div class="welcome-canvas-overlay"></div><div class="welcome-canvas-content"><img src="${escapeHtml(navbarUserAvatar.src || defaultAvatar)}" alt="Avatar de muestra"><h3 id="welcomeCardTitle"></h3><p id="welcomeCardSubtitle"></p></div></div><div class="welcome-card-controls"><div class="control-grid"><label><span>Fuente</span><select data-config="welcome.card.font">${["Inter", "Poppins", "Montserrat", "Roboto", "Serif", "Monospace"].map((font) => `<option ${card.font === font ? "selected" : ""}>${font}</option>`).join("")}</select></label><label><span>Color del texto</span><input data-config="welcome.card.textColor" type="color" value="${escapeHtml(card.textColor)}"></label><label><span>Color de fondo</span><input data-config="welcome.card.backgroundColor" type="color" value="${escapeHtml(card.backgroundColor)}"></label><label><span>Overlay <b id="overlayValue">${card.overlayOpacity}%</b></span><input data-config="welcome.card.overlayOpacity" type="range" min="0" max="90" value="${card.overlayOpacity}"></label></div><label class="welcome-field"><span>Título</span><input data-config="welcome.card.title" maxlength="100" value="${escapeHtml(card.title)}"></label><label class="welcome-field"><span>Subtítulo</span><input data-config="welcome.card.subtitle" maxlength="100" value="${escapeHtml(card.subtitle)}"></label><input data-config="welcome.card.backgroundImage" type="hidden" value="${escapeHtml(card.backgroundImage)}"><label class="background-dropzone" id="welcomeBackgroundDropzone"><input id="welcomeBackgroundFile" type="file" accept="image/png,image/jpeg,image/webp"><span>↥</span><strong>Arrastra una imagen o haz clic</strong><small>PNG, JPG o WEBP · máximo 4 MB</small></label></div></div>
      </article>
      <article class="welcome-module dm-module"><header><div><span class="module-step">03</span><h2>Mensaje privado</h2><p>Envía una bienvenida directamente al nuevo miembro.</p></div><label class="focus-switch"><input data-config="welcome.dm.enabled" type="checkbox" ${dm.enabled ? "checked" : ""}><i></i></label></header><div class="welcome-module-body"><label class="welcome-composer"><textarea data-config="welcome.dm.message" rows="4" maxlength="2000">${escapeHtml(dm.message)}</textarea><small><span>Variables disponibles: {user}, {server}</span><b>${dm.message.length} / 2000</b></small></label></div></article>
      <footer class="welcome-studio-actions"><span>Los cambios se guardan exclusivamente para este servidor.</span><button type="button" class="welcome-test-button">Enviar prueba</button><button class="primary-button">Guardar cambios</button></footer>
    </form>
  </section>`;
}

function renderNotificationsWorkspace(c) {
  const alerts = c.notifications?.twitch || [];
  const channelOptions = (selected) => guildChannels.map((channel) => `<option value="${channel.id}" ${channel.id === selected ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("");
  const roleOptions = (selected) => guildRoles.map((role) => `<option value="${role.id}" ${role.id === selected ? "selected" : ""}>@${escapeHtml(role.name)}</option>`).join("");
  const canTest = dashboardAccess.canManageUsers === true;
  const cards = alerts.map((alert, index) => `<article class="twitch-alert-card" data-alert-id="${escapeHtml(alert.id)}"><header><div class="twitch-mark">T</div><div><span>ALERTA ${index + 1}</span><h3>${escapeHtml(alert.username || "Nuevo canal")}</h3></div><label class="focus-switch"><input name="enabled" type="checkbox" ${alert.enabled !== false ? "checked" : ""}><i></i></label>${canTest ? `<button type="button" class="twitch-test" title="Herramienta disponible solo en modo dev">Enviar prueba</button>` : ""}<button type="button" class="twitch-remove" aria-label="Eliminar alerta">×</button></header><div class="twitch-alert-fields"><label><span>Usuario de Twitch</span><div class="input-prefix"><b>twitch.tv/</b><input name="username" maxlength="25" value="${escapeHtml(alert.username)}" placeholder="usuario"></div></label><label><span>Canal de Discord</span><select name="channelId"><option value="">Selecciona un canal</option>${channelOptions(alert.channelId)}</select></label><label><span>Rol que se notificará</span><select name="roleId"><option value="">Sin mencionar un rol</option>${roleOptions(alert.roleId)}</select></label><label class="twitch-message-field"><span>Mensaje personalizado</span><textarea name="message" maxlength="1800" rows="4">${escapeHtml(alert.message)}</textarea><small>{role} · {streamer} · {title} · {game} · {viewers} · {url}</small></label></div></article>`).join("");
  return `<section class="notifications-workspace"><div class="dashboard-heading"><div><p class="eyebrow">AUTOMATIZACIONES</p><h1>Notificaciones</h1><p class="dashboard-subtitle">Avisa a tu comunidad cuando tus creadores favoritos comiencen un directo.</p></div><button id="addTwitchAlert" class="primary-button" type="button">+ Añadir usuario</button></div><div class="notification-provider"><div class="twitch-provider-icon">T</div><div><h2>Alertas de Twitch</h2><p>Focus comprobará los canales cada minuto y publicará una sola alerta por directo.</p></div><span>${alerts.length} / 50</span></div><form id="twitchAlertsForm"><div id="twitchAlertsList" class="twitch-alert-list">${cards || `<div class="notification-empty"><strong>No hay alertas configuradas</strong><p>Añade un usuario de Twitch para comenzar.</p></div>`}</div><footer class="notification-actions"><span>Variables dinámicas disponibles en cada mensaje.</span><button class="primary-button">Guardar alertas</button></footer></form></section>`;
}

function renderManagementViews() {
  const c = guildConfiguration || defaultConfiguration();
  const customizer = c.customizer || defaultConfiguration().customizer;
  viewContent("customizer", `<section class="customizer-workspace"><div class="dashboard-heading"><div><p class="eyebrow">Identidad por servidor</p><h1>Personalizador de Focus</h1><p class="dashboard-subtitle">Personaliza cómo se presenta Focus en ${escapeHtml(selectedGuildName.textContent)} sin afectar otros servidores.</p></div></div><form class="customizer-card" data-settings-form="customizer"><div class="customizer-fields"><label><span>Apodo del bot</span><input name="nickname" maxlength="32" value="${escapeHtml(customizer.nickname)}" placeholder="Focus"></label><label><span>URL de avatar para mensajes</span><input name="avatarUrl" type="url" value="${escapeHtml(customizer.avatarUrl)}" placeholder="https://ejemplo.com/avatar.png"></label><label><span>URL de banner para bienvenidas</span><input name="bannerUrl" type="url" value="${escapeHtml(customizer.bannerUrl)}" placeholder="https://ejemplo.com/banner.png"></label><label><span>Color de identidad</span><input name="accentColor" type="color" value="${escapeHtml(customizer.accentColor)}"></label><p class="customizer-note">El apodo se aplica realmente en Discord. Avatar, banner y color se usan en los mensajes y vistas de esta comunidad porque Discord no permite cambiarlos por servidor.</p><button class="primary-button">Guardar personalización</button></div><aside class="customizer-preview" style="--customizer-accent:${escapeHtml(customizer.accentColor)}"><div class="customizer-preview-banner">${customizer.bannerUrl ? `<img src="${escapeHtml(customizer.bannerUrl)}" alt="Banner personalizado">` : ""}</div><div class="customizer-preview-profile">${customizer.avatarUrl ? `<img src="${escapeHtml(customizer.avatarUrl)}" alt="Avatar personalizado">` : `<span>F</span>`}<div><strong>${escapeHtml(customizer.nickname || "Focus")} <small>APP</small></strong><p>${escapeHtml(selectedGuildName.textContent)}</p></div></div><div class="customizer-preview-message">¡Hola! Esta es la identidad de Focus para este servidor.</div></aside></form></section>`);
  viewContent("welcome", `<section class="welcome-message-workspace"><div class="welcome-workspace-heading"><div><p class="eyebrow">Comunidad</p><h1>Bienvenidas</h1><p>Da una primera impresión increíble a cada miembro que se une a tu servidor.</p></div><span class="welcome-live-badge"><i></i> Configuración en vivo</span></div><form class="welcome-message-card" data-settings-form="community"><div class="welcome-message-card-header"><div><h2>Enviar un mensaje cuando un usuario se une al servidor</h2><p>Focus publicará el mensaje en el canal que selecciones.</p></div><label class="focus-switch" aria-label="Activar mensaje de bienvenida"><input data-config="welcome.enabled" type="checkbox" ${c.welcome.enabled ? "checked" : ""}><i></i></label></div><div class="welcome-card-divider"></div><div class="welcome-channel-field"><label><span>Canal de mensajes de bienvenida <b>*</b></span><input data-config="welcome.channel" value="${escapeHtml(c.welcome.channel)}" placeholder="Selecciona un canal"></label><small>Selecciona uno de los canales de texto disponibles en tu servidor.</small></div><div class="welcome-message-layout"><div><div class="message-mode-tabs"><button type="button" class="active">Mensaje de texto</button><span>Entrega automática</span></div><label class="welcome-composer"><textarea data-config="welcome.message" rows="6" maxlength="1700" placeholder="Escribe un mensaje de bienvenida...">${escapeHtml(c.welcome.message)}</textarea><small><span>Variables: <code>{user}</code> y <code>{server}</code></span><b id="welcomeMessageCount">${c.welcome.message.length} / 1700</b></small></label></div><aside class="welcome-preview"><p>VISTA PREVIA</p><div class="welcome-preview-message"><span class="preview-bot-avatar">F</span><div><strong>Focus <small>BOT</small></strong><p id="welcomePreviewMessage">${escapeHtml(c.welcome.message).replaceAll("{user}", "@nuevo-miembro").replaceAll("{server}", escapeHtml(selectedGuildName.textContent))}</p></div></div></aside></div><div class="welcome-card-footer"><span>Los cambios se sincronizan con Focus en menos de un minuto.</span><button class="primary-button">Guardar cambios</button></div></form></section>`);
  viewContent("moderation", `<div class="dashboard-heading"><div><p class="eyebrow">Seguridad</p><h1>Moderacion</h1><p class="dashboard-subtitle">Define reglas automaticas para proteger tu comunidad.</p></div></div><form class="settings-panel" data-settings-form="moderation"><label class="form-switch"><span>Moderacion automatica</span><input name="enabled" type="checkbox" ${c.moderation.enabled ? "checked" : ""}></label><label class="form-switch"><span>Detectar spam</span><input name="antiSpam" type="checkbox" ${c.moderation.antiSpam ? "checked" : ""}></label><label class="form-switch"><span>Filtrar enlaces sospechosos</span><input name="filterLinks" type="checkbox" ${c.moderation.filterLinks ? "checked" : ""}></label><label><span>Limite de advertencias</span><input name="warnLimit" type="number" min="1" max="20" value="${c.moderation.warnLimit}"></label><button class="primary-button">Guardar reglas</button></form>`);
  viewContent("roles", `<div class="dashboard-heading"><div><p class="eyebrow">Comunidad</p><h1>Roles automaticos</h1></div></div><form class="settings-panel" data-settings-form="roles"><label><span>Rol predeterminado</span><input name="defaultRole" value="${escapeHtml(c.roles.defaultRole)}" placeholder="Miembro"></label><label class="form-switch"><span>Asignar rol al entrar</span><input name="enabled" type="checkbox" ${c.roles.enabled ? "checked" : ""}></label><button class="primary-button">Guardar roles</button></form>`);
  viewContent("automation", `<div class="dashboard-heading"><div><p class="eyebrow">Flujos</p><h1>Automatizaciones</h1></div></div><form class="settings-panel" data-settings-form="automation"><label class="form-switch"><span>Registrar logs del servidor</span><input name="logs" type="checkbox" ${c.automation.logs ? "checked" : ""}></label><label class="form-switch"><span>Mensaje al unirse un miembro</span><input name="joinMessage" type="checkbox" ${c.automation.joinMessage ? "checked" : ""}></label><button class="primary-button">Guardar automatizaciones</button></form>`);
  viewContent("settings", `<div class="dashboard-heading"><div><p class="eyebrow">Preferencias</p><h1>Perfil del servidor</h1></div></div><form class="settings-panel" data-settings-form="profile"><label><span>Descripcion</span><textarea name="description" rows="3" placeholder="Describe tu comunidad">${escapeHtml(c.profile.description)}</textarea></label><label><span>Invitacion de Discord</span><input name="invite" value="${escapeHtml(c.profile.invite)}" placeholder="https://discord.gg/..." type="url"></label><button class="primary-button">Guardar perfil</button></form>`);
  viewContent("api", `<div class="dashboard-heading"><div><p class="eyebrow">Documentacion</p><h1>API y eventos</h1><p class="dashboard-subtitle">Conecta tu bot para ver actividad real en este panel.</p></div></div><div class="docs-grid"><article><h3>Registrar evento</h3><code>POST /api/events</code><p>Incluye el encabezado <code>x-event-token</code> y los campos guildId y eventType.</p></article><article><h3>Eventos disponibles</h3><p>message, member_join, member_leave, moderation y warn.</p></article><article><h3>Configuracion</h3><code>PUT /api/guilds/:id/settings</code><p>Disponible para administradores autenticados.</p></article></div>`);
  viewContent("premium", `<div class="dashboard-heading"><div><p class="eyebrow">Focus</p><h1>Premium</h1><p class="dashboard-subtitle">Planes para comunidades que necesitan mas automatizacion.</p></div></div><div class="docs-grid plans-grid"><article><h3>Gratis</h3><p>Moderacion y bienvenida esenciales.</p><strong>$0 / mes</strong></article><article class="featured-plan"><h3>Premium</h3><p>Logs avanzados, automatizaciones y soporte prioritario.</p><strong>$4.99 / mes</strong></article><article><h3>Comunidades</h3><p>Funciones a medida para servidores grandes.</p><strong>Contactanos</strong></article></div>`);
  viewContent("notifications", renderNotificationsWorkspace(c));
  viewContent("welcome", renderWelcomeWorkspace(c));
  renderWelcomeChannelSelector(c.welcome.channel);
  bindCustomizerPreview();
  bindNotificationsView();
  bindWelcomePreview();
  bindSettingsForms();
}

function bindNotificationsView() {
  const form = document.querySelector("#twitchAlertsForm");
  const addButton = document.querySelector("#addTwitchAlert");
  if (!form || !addButton) return;
  addButton.addEventListener("click", () => {
    if ((guildConfiguration.notifications?.twitch || []).length >= 50) return showToast("Máximo 50 alertas por servidor", true);
    if (!guildConfiguration.notifications) guildConfiguration.notifications = { twitch: [] };
    guildConfiguration.notifications.twitch.push({ id: `twitch-${Date.now()}`, enabled: true, username: "", channelId: "", roleId: "", message: "¡{role} **{streamer}** está en directo!\n{title}\n{url}" });
    renderManagementViews();
  });
  form.querySelectorAll(".twitch-remove").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest(".twitch-alert-card").dataset.alertId;
    guildConfiguration.notifications.twitch = guildConfiguration.notifications.twitch.filter((alert) => alert.id !== id);
    renderManagementViews();
  }));
  form.querySelectorAll('[name="username"]').forEach((input) => input.addEventListener("input", () => {
    input.closest(".twitch-alert-card").querySelector("h3").textContent = input.value.trim() || "Nuevo canal";
  }));
  form.querySelectorAll(".twitch-test").forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest(".twitch-alert-card");
    const alerts = readTwitchAlerts(form);
    if (alerts.some((alert) => !/^[a-z0-9_]{3,25}$/.test(alert.username) || !alert.channelId)) return showToast("Guarda un usuario y canal válidos antes de probar", true);
    guildConfiguration.notifications = { twitch: alerts };
    button.disabled = true;
    button.textContent = "Enviando...";
    try {
      await saveGuildConfiguration("notifications");
      const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/notifications/twitch/${encodeURIComponent(card.dataset.alertId)}/test`, { method: "POST", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo enviar la prueba");
      showToast(`Alerta de prueba enviada a #${result.channel.name}`);
    } catch (error) {
      showToast(error.message || "No se pudo enviar la prueba", true);
    } finally {
      button.disabled = false;
      button.textContent = "Enviar prueba";
    }
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const alerts = readTwitchAlerts(form);
    if (alerts.some((alert) => !/^[a-z0-9_]{3,25}$/.test(alert.username) || !alert.channelId)) return showToast("Revisa el usuario de Twitch y el canal de Discord", true);
    guildConfiguration.notifications = { twitch: alerts };
    try { await saveGuildConfiguration("notifications"); renderManagementViews(); } catch (error) { showToast(error.message || "No se pudieron guardar las alertas", true); }
  });
}

function readTwitchAlerts(form) {
  return [...form.querySelectorAll(".twitch-alert-card")].map((card) => ({ id: card.dataset.alertId, enabled: card.querySelector('[name="enabled"]').checked, username: card.querySelector('[name="username"]').value.trim().replace(/^@/, "").toLowerCase(), channelId: card.querySelector('[name="channelId"]').value, roleId: card.querySelector('[name="roleId"]').value, message: card.querySelector('[name="message"]').value.trim() }));
}

function bindCustomizerPreview() {
  const form = document.querySelector('[data-view="customizer"] [data-settings-form="customizer"]');
  if (!form) return;
  form.elements.avatarUrl.placeholder = "https://media.discordapp.net/attachments/.../avatar.png";
  form.elements.bannerUrl.placeholder = "https://media.discordapp.net/attachments/.../banner.png";
  form.querySelector(".customizer-note").textContent = "Apodo, avatar y banner se aplican al perfil real de Focus únicamente en este servidor. Usa enlaces de imágenes subidas a Discord (máximo 8 MB).";
  const preview = form.querySelector(".customizer-preview");
  const banner = form.querySelector(".customizer-preview-banner");
  const profile = form.querySelector(".customizer-preview-profile");
  const update = () => {
    const nickname = form.elements.nickname.value.trim() || "Focus";
    const avatarUrl = form.elements.avatarUrl.value.trim();
    const bannerUrl = form.elements.bannerUrl.value.trim();
    preview.style.setProperty("--customizer-accent", form.elements.accentColor.value);
    profile.querySelector("strong").firstChild.textContent = `${nickname} `;
    const currentAvatar = profile.firstElementChild;
    const nextAvatar = avatarUrl ? document.createElement("img") : document.createElement("span");
    if (avatarUrl) { nextAvatar.src = avatarUrl; nextAvatar.alt = "Avatar personalizado"; } else { nextAvatar.textContent = "F"; }
    currentAvatar.replaceWith(nextAvatar);
    banner.replaceChildren();
    if (bannerUrl) { const image = document.createElement("img"); image.src = bannerUrl; image.alt = "Banner personalizado"; banner.append(image); }
  };
  form.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
}

function renderWelcomeChannelSelector(selectedChannel) {
  const input = document.querySelector('[data-view="welcome"] [data-config="welcome.channel"]');
  if (!input) return;
  if (!guildChannels.length) {
    input.placeholder = "ID del canal de bienvenida";
    const helpText = input.closest("label")?.querySelector("small");
    if (helpText) helpText.textContent = guildChannelsNotice || "No hay canales disponibles para seleccionar.";
    return;
  }

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
  const form = document.querySelector('[data-view="welcome"] [data-settings-form="community"]');
  if (!form) return;
  const composer = form.querySelector('[data-config="welcome.message"]');
  const preview = form.querySelector("#welcomePreviewMessage");
  const counter = form.querySelector("#welcomeMessageCount");
  const formatInput = form.querySelector('[data-config="welcome.format"]');
  const replaceVariables = (value) => String(value || "").replaceAll("{user}", "@nuevo-miembro").replaceAll("{server}", selectedGuildName.textContent || "tu servidor").replaceAll("{server.member_count}", bannerMemberCount.textContent || "1");

  form.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
    formatInput.value = button.dataset.format;
    form.querySelectorAll("[data-format]").forEach((item) => item.classList.toggle("active", item === button));
    form.querySelector(".discord-message-preview").classList.toggle("embed-preview", button.dataset.format === "embed");
  }));
  form.querySelectorAll("[data-variable]").forEach((button) => button.addEventListener("click", () => {
    composer.setRangeText(button.dataset.variable, composer.selectionStart, composer.selectionEnd, "end");
    composer.dispatchEvent(new Event("input"));
    composer.focus();
  }));

  const updatePreview = () => {
    preview.textContent = replaceVariables(composer.value);
    counter.textContent = `${composer.value.length} / 2000`;
    form.querySelector("#welcomeCardTitle").textContent = replaceVariables(form.querySelector('[data-config="welcome.card.title"]').value);
    form.querySelector("#welcomeCardSubtitle").textContent = replaceVariables(form.querySelector('[data-config="welcome.card.subtitle"]').value);
    const canvas = form.querySelector("#welcomeCardPreview");
    const overlay = form.querySelector('[data-config="welcome.card.overlayOpacity"]');
    canvas.style.setProperty("--card-bg", form.querySelector('[data-config="welcome.card.backgroundColor"]').value);
    canvas.style.setProperty("--card-text", form.querySelector('[data-config="welcome.card.textColor"]').value);
    canvas.style.setProperty("--card-overlay", Number(overlay.value) / 100);
    canvas.style.setProperty("--card-font", form.querySelector('[data-config="welcome.card.font"]').value);
    form.querySelector("#overlayValue").textContent = `${overlay.value}%`;
  };
  form.querySelectorAll("textarea, input, select").forEach((input) => input.addEventListener("input", updatePreview));

  const fileInput = form.querySelector("#welcomeBackgroundFile");
  const dropzone = form.querySelector("#welcomeBackgroundDropzone");
  const backgroundInput = form.querySelector('[data-config="welcome.card.backgroundImage"]');
  const useBackgroundFile = (file) => {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return showToast("Usa una imagen PNG, JPG o WEBP", true);
    if (file.size > 4 * 1024 * 1024) return showToast("La imagen supera los 4 MB", true);
    const reader = new FileReader();
    reader.onload = () => { backgroundInput.value = reader.result; const image = form.querySelector(".welcome-canvas-bg"); image.src = reader.result; image.hidden = false; showToast("Fondo cargado"); };
    reader.readAsDataURL(file);
  };
  fileInput.addEventListener("change", () => useBackgroundFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (event) => useBackgroundFile(event.dataTransfer.files[0]));

  const testButton = form.querySelector(".welcome-test-button");
  testButton.addEventListener("click", async () => {
    applyCommunitySettings(form);
    if (isLocalEnvironment) return showToast("Modo local: la vista previa está activa; despliega para enviar a Discord");
    testButton.disabled = true; testButton.textContent = "Enviando...";
    try {
      await saveGuildConfiguration("welcome");
      const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/welcome/test`, { method: "POST", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const sent = [data.messageSent && "mensaje", data.cardSent && "tarjeta", data.dmSent && "DM"].filter(Boolean).join(", ");
      showToast(data.warnings?.length ? `${sent || "Prueba parcial"}: ${data.warnings.join(" ")}` : `${sent || "Prueba"} enviado a #${data.channel.name}`, Boolean(data.warnings?.length));
    } catch (error) { showToast(error.message || "No se pudo enviar la prueba", true); } finally { testButton.disabled = false; testButton.textContent = "Enviar prueba"; }
  });
  updatePreview();
}

function bindLegacyWelcomePreview() {
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
      await saveGuildConfiguration("welcome");
      const response = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/welcome/test`, {
        method: "POST",
        credentials: "same-origin"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo enviar la prueba");
      const sent = [data.messageSent && "mensaje", data.cardSent && "tarjeta", data.dmSent && "DM"].filter(Boolean).join(", ");
      showToast(data.warnings?.length ? `${sent || "Prueba parcial"}: ${data.warnings.join(" ")}` : `${sent || "Prueba"} enviado a #${data.channel.name}`, Boolean(data.warnings?.length));
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
  form.querySelectorAll("[data-config]").forEach((input) => {
    const path = input.dataset.config.split(".");
    let target = guildConfiguration;
    path.slice(0, -1).forEach((key) => { if (!target[key]) target[key] = {}; target = target[key]; });
    target[path.at(-1)] = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value.trim();
  });
  const welcomeToggle = form.querySelector('[data-config="welcome.enabled"]');
  if (welcomeToggle) guildConfiguration.automation.joinMessage = welcomeToggle.checked;
}

function applyLegacyCommunitySettings(form) {
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
        try { await saveGuildConfiguration("welcome"); renderManagementViews(); } catch { showToast("No se pudieron guardar los cambios", true); }
        return;
      }
      const next = {};
      form.querySelectorAll("input, textarea").forEach((input) => { next[input.name] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value.trim(); });
      guildConfiguration[key] = { ...guildConfiguration[key], ...next };
      try { await saveGuildConfiguration(key); } catch (error) { showToast(error.message || "No se pudieron guardar los cambios", true); }
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
  if (statsSource) statsSource.textContent = stats.messages || stats.newMembers30d || stats.moderationActions || stats.warns ? "Datos reales de Focus" : "Aún sin eventos registrados";
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
    if (statsSource) statsSource.textContent = "Inicia sesión para datos reales";
    [statMessages, statNewMembers, statModeration, statWarns].forEach((element) => { if (element) element.textContent = "--"; });
    Object.values(statChangeElements).forEach((element) => { if (element) element.textContent = "Sin datos"; });
    setStatsLoading(false);
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
    if (statsSource) statsSource.textContent = "No se pudieron cargar los datos";
    setStatsLoading(false);
  }
}

function formatGuildAge(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(date).replaceAll(".", "");
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
  guilds.sort((first, second) => Number(Boolean(second.botInstalled)) - Number(Boolean(first.botInstalled)) || first.name.localeCompare(second.name, "es"));
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

    const badges = document.createElement("span");
    badges.className = "guild-badges";

    const accessLabel = document.createElement("small");
    accessLabel.className = guild.owner ? "guild-owner-badge" : "guild-admin-badge";
    accessLabel.textContent = guild.owner ? "Propietario" : "Administrador";
    badges.append(accessLabel);

    if (!guild.botInstalled) {
      const installLabel = document.createElement("small");
      installLabel.className = "guild-invite-badge";
      installLabel.textContent = "Sin Focus";
      badges.append(installLabel);
      option.classList.add("guild-option-missing-bot");
    }

    option.append(badges);
    option.addEventListener("click", () => guild.botInstalled ? selectGuild(guild) : inviteBot(guild));
    guildsMenu.append(option);

    const card = document.createElement("article");
    card.className = "dashboard-guild-card";
    card.append(createGuildIcon(guild, "dashboard-guild-card-icon"));
    const cardInfo = document.createElement("div");
    cardInfo.className = "dashboard-guild-card-info";
    const cardName = document.createElement("h3");
    cardName.textContent = guild.name;
    const cardMeta = document.createElement("p");
    const accessName = guild.owner ? "Propietario" : "Administrador";
    const installationName = guild.botInstalled ? "Focus instalado" : "Focus no instalado";
    cardMeta.textContent = `${Number(guild.memberCount || 0).toLocaleString()} miembros · ${accessName} · ${installationName}`;
    cardInfo.append(cardName, cardMeta);
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "guild-open-button";
    openButton.textContent = guild.botInstalled ? "Abrir" : "Invitar bot";
    openButton.addEventListener("click", () => guild.botInstalled ? selectGuild(guild) : inviteBot(guild));
    card.append(cardInfo, openButton);
    dashboardGuildGrid.append(card);

  });

  const savedGuildId = localStorage.getItem(selectedGuildKey);
  const selectedGuild = guilds.find((guild) => guild.id === savedGuildId && guild.botInstalled) || guilds.find((guild) => guild.botInstalled);
  if (selectedGuild) selectGuild(selectedGuild);
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
      if (link.dataset.section === "developers") loadDevelopers();
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
    const settings = JSON.parse(localStorage.getItem("focusbot.settings") || "{}");
    if (typeof settings[input.dataset.setting] === "boolean") input.checked = settings[input.dataset.setting];
    input.addEventListener("change", () => {
      const current = JSON.parse(localStorage.getItem("focusbot.settings") || "{}");
      current[input.dataset.setting] = input.checked;
      localStorage.setItem("focusbot.settings", JSON.stringify(current));
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
      applyDashboardAccess(user);
      renderGuilds(Array.isArray(user.guilds) ? user.guilds : []);
      setupNavigation();
      if (document.querySelector(".sidebar-link.active")?.hidden) document.querySelector(".sidebar-link[data-section]:not([hidden])")?.click();
      logoutButton.hidden = false;
      return;
    }

    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) throw new Error("No autenticado");

    const { user } = await response.json();
    localStorage.setItem(savedUserKey, JSON.stringify(user));
    renderUser(user);
    applyDashboardAccess(user);
    renderGuilds(Array.isArray(user.guilds) ? user.guilds : []);
    setupNavigation();
    if (document.querySelector(".sidebar-link.active")?.hidden) document.querySelector(".sidebar-link[data-section]:not([hidden])")?.click();
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

profileMenuButton?.addEventListener("click", () => { userMenu.hidden = true; userMenuButton.setAttribute("aria-expanded", "false"); document.querySelector('.sidebar-link[data-section="overview"]')?.click(); });
planMenuButton?.addEventListener("click", () => { userMenu.hidden = true; showToast("La administración de planes estará disponible próximamente"); });
developerMenuButton?.addEventListener("click", () => {
  userMenu.hidden = true;
  userMenuButton.setAttribute("aria-expanded", "false");
  document.querySelectorAll(".sidebar-link").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".dashboard-view").forEach((view) => view.classList.remove("active"));
  document.querySelector('[data-view="developers"]')?.classList.add("active");
  loadDevelopers();
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
