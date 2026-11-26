import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";

import { config } from "./config";
import "./db"; // open and migrate the database before anything queries it
import { registerApi } from "./api";
import { attachSync } from "./sync";

// One process serves the REST API and the realtime sync socket on a single
// port: HTTP routes under /api, the Yjs sync protocol under /sync/<workspace>.

const app = Fastify({ logger: false, trustProxy: true });

app.register(cors, { origin: config.corsOrigin, credentials: true });
app.register(cookie);
registerApi(app);

// Share Fastify's underlying HTTP server with the WebSocket layer.
attachSync(app.server);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[continuum] API + sync listening on http://localhost:${config.port}`);
  console.log(`[continuum] database: ${config.dbPath}`);
} catch (err) {
  console.error("[continuum] failed to start:", err);
  process.exit(1);
}
