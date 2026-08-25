# SoniaBot Web

Web de SoniaBot con autenticacion OAuth2 de Discord.

## Configuracion local

1. Instala Node.js 18 o superior.
2. Crea el archivo `.env` a partir de `.env.example`.
3. Completa `CLIENT_SECRET` y `SESSION_SECRET`.
4. En Discord Developer Portal registra `http://localhost:3000/auth/callback`.
5. Ejecuta:

```powershell
npm install
npm start
```

Abre `http://localhost:3000`.

## Publicacion en Hostinger

Configura una aplicacion Node.js que ejecute `server.js` y usa el directorio del proyecto como raiz publica. Define en las variables de entorno de Hostinger:

```env
CLIENT_ID=1540939068693544992
CLIENT_SECRET=tu_client_secret_real
REDIRECT_URI=https://soniabot.playorch.tech/auth/callback
SESSION_SECRET=una_clave_larga_y_aleatoria
DISCORD_BOT_TOKEN=token_privado_del_bot
EVENT_INGEST_TOKEN=token_privado_para_eventos
DATABASE_PATH=soniabot.sqlite
NODE_ENV=production
```

Deja que Hostinger asigne `PORT` si ofrece esa variable. En Discord registra exactamente:

```text
https://soniabot.playorch.tech/auth/callback
```

Comprueba el despliegue visitando `https://soniabot.playorch.tech/health`; debe responder `{"ok":true}`. Si responde `404`, el dominio sigue apuntando a un sitio estatico y no al proceso Node.js.

## Eventos del bot

Este repositorio no contiene el cliente `discord.js` del bot. Usa `bot-events.example.js` en el proyecto del bot, configura `SONIABOT_STATS_API_URL` con la URL de esta web y `SONIABOT_EVENT_INGEST_TOKEN` con el mismo valor de `EVENT_INGEST_TOKEN`.
