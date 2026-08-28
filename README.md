# Focus Web

Panel web y bot de Discord para gestionar mensajes de bienvenida, moderacion y estadisticas de una comunidad.

## Estructura

```text
src/
  app/            Configuracion HTTP, OAuth y rutas de la API
  data/           Acceso y esquema de SQLite
  server.js        Punto de entrada de la aplicacion web
public/
  landing/        Pagina principal y sus recursos
  dashboard/      Panel de control y sus recursos
  shared/         JavaScript reutilizable entre vistas
  assets/         Imagenes y logotipos
sonia-bot/
  src/            Arranque del cliente de Discord
  commands/       Comandos slash por categoria
  services/       Conexion del bot con la API web
  data/           Datos locales del bot
examples/         Ejemplos de integracion externa
```

## Web: configuracion local

1. Instala Node.js 18 o superior.
2. Crea `.env` a partir de `.env.example` y completa los secretos.
3. En Discord Developer Portal registra `http://localhost:3000/auth/callback` como Redirect URI.
4. Ejecuta:

```powershell
npm install
npm start
```

Abre `http://localhost:3000`.

## Despliegue

La aplicacion web se inicia con `node src/server.js`. Configura estas variables en el proveedor de hosting:

```env
CLIENT_ID=1540939068693544992
CLIENT_SECRET=tu_client_secret_real
REDIRECT_URI=https://soniabot.playorch.tech/auth/callback
SESSION_SECRET=una_clave_larga_y_aleatoria
DISCORD_BOT_TOKEN=token_privado_del_bot
EVENT_INGEST_TOKEN=token_privado_para_eventos
FOCUS_OWNER_IDS=tu_id_de_discord
DATABASE_URL=postgresql://focus_app:tu_contrasena@host-interno:5432/focus
NODE_ENV=production
```

No declares `PORT` si el proveedor lo asigna automaticamente. Registra exactamente la misma `REDIRECT_URI` en Discord Developer Portal. La comprobacion publica es `https://soniabot.playorch.tech/health`, que debe devolver `{"ok":true}`.

## Bot incluido

El cliente de Discord esta en `sonia-bot/`. Crea `sonia-bot/.env` desde `sonia-bot/.env.example` y asegurate de que `SONIABOT_EVENT_INGEST_TOKEN` sea exactamente igual a `EVENT_INGEST_TOKEN` de la web.

```powershell
cd sonia-bot
npm install
npm start
```

El bot envia un heartbeat cada 45 segundos y registra mensajes, entradas, salidas y acciones de moderacion.

## Bienvenidas

1. En `sonia-bot/.env`, establece `SONIABOT_STATS_API_URL=https://tu-dominio` y el mismo token de eventos de la web.
2. En Discord Developer Portal habilita **Server Members Intent**. Habilita tambien **Message Content Intent** si usaras el filtro de enlaces o anti-spam.
3. En el dashboard abre **Bienvenidas**, elige un canal, configura texto o embed, y guarda.
4. Pulsa **Enviar prueba a Discord** para verificar el canal y los permisos.

El bot necesita permisos **Ver canales** y **Enviar mensajes** en el canal configurado. Nunca subas `.env`, tokens ni la base de datos al repositorio.

## Equipo de desarrollo

Configura `FOCUS_OWNER_IDS` con tu ID de Discord (o varios IDs separados por comas) en el entorno de la web. Solo esos propietarios ven **Equipo dev** y pueden añadir o retirar accesos por ID de Discord. Cada desarrollador puede recibir acceso independiente a **Visión general** y **Bienvenidas**.
