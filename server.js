require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const session = require("express-session");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = __dirname;

app.set("trust proxy", 1);

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REDIRECT_URI || !process.env.SESSION_SECRET) {
  throw new Error("Faltan CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o SESSION_SECRET en .env");
}

app.use(express.json());
app.use(session({
  name: "soniabot.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state || state !== req.session.oauthState) {
    return res.status(400).send("La autenticacion de Discord fue cancelada o no es valida.");
  }

  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) throw new Error("No se pudo obtener el token de Discord");
    const token = await tokenResponse.json();

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${token.token_type} ${token.access_token}` }
    });

    if (!userResponse.ok) throw new Error("No se pudo obtener el usuario de Discord");
    const user = await userResponse.json();

    req.session.user = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`
    };

    res.redirect("/dashboard.html");
  } catch (authError) {
    console.error(authError);
    res.status(502).send("No se pudo completar la autenticacion con Discord.");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: req.session.user });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.clearCookie("soniabot.sid").json({ ok: true }));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`SoniaBot web disponible en http://0.0.0.0:${port}`);
});
