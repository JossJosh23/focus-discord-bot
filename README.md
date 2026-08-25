# SoniaBot Web

Web de SoniaBot con autenticacion OAuth2 de Discord.

## Estructura

```text
src/              API web y acceso a SQLite
public/           Archivos que se sirven al navegador
  landing/        Pagina principal
  dashboard/      Panel de control
  assets/ css/ js/
examples/         Integraciones de referencia para el bot
```

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

Configura una aplicacion Node.js que ejecute `src/server.js` y usa el directorio del proyecto como raiz publica. Define en las variables de entorno de Hostinger:

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

Este repositorio no contiene el cliente `discord.js` del bot. Usa `examples/bot-events.example.js` en el proyecto del bot, configura `SONIABOT_STATS_API_URL` con la URL de esta web y `SONIABOT_EVENT_INGEST_TOKEN` con el mismo valor de `EVENT_INGEST_TOKEN`.

## Bienvenidas desde el panel

1. Copia `examples/bot-events.example.js` al proyecto donde corre tu bot e importa `registerStatsListeners`.
2. Tras crear e iniciar tu cliente de `discord.js`, ejecuta `registerStatsListeners(client)` una sola vez.
3. En el `.env` del bot configura `SONIABOT_STATS_API_URL=https://tu-dominio` (sin `/` final) y `SONIABOT_EVENT_INGEST_TOKEN` con el mismo secreto que `EVENT_INGEST_TOKEN` de esta web.
4. Activa **Server Members Intent** en Discord Developer Portal y añade `GatewayIntentBits.GuildMembers` a los intents del cliente. Sin ese intent Discord no emitira `guildMemberAdd`.
5. En el dashboard, abre **Bienvenidas**, activa la opcion, indica preferiblemente el ID del canal, escribe el mensaje y guarda. El bot lee esa configuracion cada vez que entra alguien.

Ejemplo de arranque del bot:

```js
const { Client, GatewayIntentBits } = require("discord.js");
const { registerStatsListeners } = require("./bot-events");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});
registerStatsListeners(client);
client.login(process.env.DISCORD_BOT_TOKEN);
```

El bot necesita permiso para ver y enviar mensajes en el canal configurado.

## Bot incluido

El cliente de Discord se encuentra en `sonia-bot/` y ya esta conectado con la web. Para ejecutarlo en desarrollo:

```powershell
cd sonia-bot
npm start
```

Crea `sonia-bot/.env` desde `sonia-bot/.env.example`. El valor de `SONIABOT_EVENT_INGEST_TOKEN` debe ser exactamente igual a `EVENT_INGEST_TOKEN` de la web. No compartas esos valores ni los subas a Git.

El bot envia un heartbeat cada 45 segundos; por eso el estado del dashboard cambia a desconectado si deja de reportar durante 90 segundos. Tambien registra mensajes, entradas, salidas y acciones exitosas de moderacion.
