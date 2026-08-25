const savedUserKey = "soniabot.user";
const loginButton = document.querySelector("#loginButton");

if (loginButton) {
  loginButton.addEventListener("click", () => {
    window.location.assign("/auth/discord");
  });
}

function saveUser(user) {
  localStorage.setItem(savedUserKey, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(savedUserKey);
}

function renderUser(user) {
  const loginButton = document.querySelector("#loginButton");
  const userMenu = document.querySelector("#userMenu");
  const avatar = document.querySelector("#userAvatar");
  const userName = document.querySelector("#userName");

  if (!loginButton || !userMenu || !avatar || !userName) return;

  loginButton.hidden = true;
  userMenu.hidden = false;
  avatar.src = user.avatarUrl;
  avatar.alt = `Avatar de ${user.globalName}`;
  userName.textContent = user.globalName;
}

async function loadSession() {
  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Sesion no activa");

    const result = await response.json();
    saveUser(result.user);
    renderUser(result.user);
  } catch {
    clearUser();
  }
}

loadSession();
