#!/usr/bin/env node
import { runHttpServer } from "./http-server.js";

runHttpServer().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
