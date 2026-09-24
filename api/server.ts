import http from "http";
import { app } from "./app.js";
import { config } from "../config/index.js";
import { db } from "../database/connection.js";

const server = http.createServer(app);

server.listen(config.port, config.host, async () => {
  console.log(`=======================================================`);
  console.log(`[stockiq] Foundation Service Started`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Listening on: http://${config.host}:${config.port}`);
  console.log(`Health Check: http://${config.host}:${config.port}/health`);
  console.log(`Readiness:    http://${config.host}:${config.port}/ready`);
  console.log(`API v1:       http://${config.host}:${config.port}/api/v1`);
  console.log(`=======================================================`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[stockiq] Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log(`[stockiq] HTTP server closed.`);
    await db.close();
    console.log(`[stockiq] Database pool drained.`);
    process.exit(0);
  });

  // Force close after 10s if hanging
  setTimeout(() => {
    console.error(`[stockiq] Graceful shutdown timed out. Forcing exit.`);
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { server };
