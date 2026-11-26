import { defineConfig } from "vite";

// The sync server runs as a separate process (npm run sync) on SYNC_PORT.
// We expose that port to the client at build time so the browser knows where
// to open its WebSocket.
export default defineConfig({
  server: {
    host: true, // listen on the LAN so a second physical device can connect
    port: 5173,
  },
  define: {
    __API_PORT__: JSON.stringify(process.env.PORT ?? process.env.API_PORT ?? "8787"),
  },
});
