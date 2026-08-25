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
      name: "SoniaBot Support",
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

function selectGuild(guild) {
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
}

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
    element.textContent = change === null || change === undefined ? "Sin histórico" : `${change >= 0 ? "+" : ""}${change}%`;
    element.className = `metric-change ${change >= 0 ? "positive" : "negative"}`;
  });
}

async function loadGuildStats(guildId) {
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
    renderGuildStats(await response.json());
  } catch {
    [serverMembers, serverRoles, serverAge, bannerMemberCount, statMessages, statNewMembers, statModeration, statWarns]
      .forEach((element) => { if (element) element.textContent = "--"; });
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
    emptyMessage.textContent = "No perteneces a ningun servidor.";
    selectedGuildName.textContent = "Sin servidores";
    selectorButton.disabled = true;
    return;
  }

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

  document.title = `${displayName} | SoniaBot`;
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

document.querySelectorAll(".sidebar-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-link").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".dashboard-view").forEach((view) => view.classList.remove("active"));
    link.classList.add("active");
    document.querySelector(`[data-view="${link.dataset.section}"]`).classList.add("active");
    dashboardSidebar.classList.remove("open");
  });
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
updateClock();
setInterval(updateClock, 60000);
