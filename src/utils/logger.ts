type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let currentLevel: Level = "info";

export function setLogLevel(level: Level) {
  currentLevel = level;
}

function emit(level: Level, msg: string, extra?: unknown) {
  if (ORDER[level] < ORDER[currentLevel]) return;
  // MCP uses stdio — logs MUST go to stderr to not corrupt the protocol stream.
  const line = extra !== undefined
    ? `[${level}] ${msg} ${JSON.stringify(extra)}`
    : `[${level}] ${msg}`;
  process.stderr.write(line + "\n");
}

export const log = {
  debug: (msg: string, extra?: unknown) => emit("debug", msg, extra),
  info: (msg: string, extra?: unknown) => emit("info", msg, extra),
  warn: (msg: string, extra?: unknown) => emit("warn", msg, extra),
  error: (msg: string, extra?: unknown) => emit("error", msg, extra),
};
