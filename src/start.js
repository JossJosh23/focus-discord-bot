require("dotenv").config();

// Dokploy supervisa este proceso. La web y el bot se inician juntos, por lo
// que ambos vuelven a levantarse automaticamente tras un reinicio o una caida.
require("./app/server");
require("../focus-bot/src/bot");
