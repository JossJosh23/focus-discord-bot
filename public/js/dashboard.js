const savedUserKey = "soniabot.user";
const selectedGuildKey = "soniabot.selectedGuild";
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";

const dashboardContent = document.querySelector("#dashboardContent");
const guildsList = document.querySelector("#guildsList");
const logoutButton = document.querySelector("#logoutButton");
const guildsMenu = document.querySelector("#guildsMenu");
const selectorButton = document.querySelector("#serverSelectorButton");
const selectedGuildIcon = document.querySelector("#selectedGuildIcon");
const selectedGuildName = document.querySelector("#selectedGuildName");
const navbarUserAvatar = document.querySelector("#navbarUserAvatar");
const navbarUserName = document.querySelector("#navbarUserName");
const previewMode = new URLSearchParams(window.location.search).get("preview") === "1";

const previewUser = {
  username: "demo_user",
  globalName: "Usuario Demo",
  avatarUrl: defaultAvatar,
  guilds: [
    {
      id: "preview-1",
      name: "SoniaBot Support",
      iconUrl: null,
      owner: true
    },
    {
      id: "preview-2",
      name: "Mi Comunidad Discord",
      iconUrl: null,
      owner: false
    },
    {
      id: "preview-3",
      name: "Gaming Latino",
      iconUrl: null,
      owner: false
    }
  ]
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

  document.querySelectorAll(".guild-option").forEach((option) => {
    option.setAttribute("aria-selected", option.dataset.guildId === guild.id ? "true" : "false");
  });

  guildsMenu.hidden = true;
  selectorButton.setAttribute("aria-expanded", "false");
}

function createGuildIcon(guild) {
  if (!guild.iconUrl) {
    const placeholder = document.createElement("span");
    placeholder.className = "guild-icon-placeholder";
    placeholder.textContent = guild.name.charAt(0).toUpperCase();
    return placeholder;
  }

  const icon = document.createElement("img");
  icon.className = "guild-icon";
  icon.src = guild.iconUrl;
  icon.alt = "";
  return icon;
}

function renderGuilds(guilds) {
  guildsList.replaceChildren();
  guildsMenu.replaceChildren();

  if (!guilds.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "No perteneces a ningun servidor.";
    guildsList.append(emptyMessage);
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

    const guildItem = option.cloneNode(true);
    guildItem.className = "guild-item";
    guildItem.removeAttribute("role");
    guildItem.disabled = false;
    guildItem.addEventListener("click", () => selectGuild(guild));
    guildsList.append(guildItem);
  });

  const savedGuildId = localStorage.getItem(selectedGuildKey);
  const selectedGuild = guilds.find((guild) => guild.id === savedGuildId) || guilds[0];
  selectGuild(selectedGuild);
}

function renderUser(user) {
  const avatarUrl = user.avatarUrl || defaultAvatar;
  const displayName = user.globalName || user.username || "Usuario";
  navbarUserAvatar.src = avatarUrl;
  navbarUserAvatar.alt = `Avatar de ${displayName}`;
  navbarUserName.textContent = displayName;

  const avatar = document.createElement("img");
  avatar.className = "dashboard-avatar";
  avatar.src = avatarUrl;
  avatar.alt = `Avatar de ${displayName}`;

  const welcome = document.createElement("p");
  welcome.textContent = `Bienvenido, ${displayName}.`;
  dashboardContent.replaceChildren(avatar, welcome);
}

async function loadDashboard() {
  try {
    if (previewMode) {
      renderUser(previewUser);
      renderGuilds(previewUser.guilds);
      logoutButton.hidden = false;
      return;
    }

    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) throw new Error("No autenticado");

    const { user } = await response.json();
    localStorage.setItem(savedUserKey, JSON.stringify(user));
    renderUser(user);
    renderGuilds(Array.isArray(user.guilds) ? user.guilds : []);
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

logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  localStorage.removeItem(savedUserKey);
  localStorage.removeItem(selectedGuildKey);
  window.location.replace("/");
});

loadDashboard();
