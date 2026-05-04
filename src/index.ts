#!/usr/bin/env node
import { runServer } from "./server.js";

runServer().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
