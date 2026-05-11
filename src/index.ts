#!/usr/bin/env node

import { startHttpServer } from "./server/http-server.js";

const portRaw = process.env.PORT ?? "3000";
const port = Number.parseInt(portRaw, 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[mcp] startup failed: PORT must be 1-65535. Got: ${portRaw}`);
  process.exit(1);
}

startHttpServer(port);
