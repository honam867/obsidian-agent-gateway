import path from "node:path";
import os from "node:os";

export interface Config {
  vaultPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  tz: string;
  http: {
    host: string;
    port: number;
  };
  breakdown: {
    small: number;
    large: number;
  };
  learnThreshold?: number;
}

const DEFAULT_VAULT_WIN = "D:\\working\\AgentGateway";
const DEFAULT_VAULT_NIX = path.join(os.homedir(), "AgentGateway");

export function loadConfig(): Config {
  const isWin = process.platform === "win32";
  const vaultPath = process.env.AGENT_GATEWAY_VAULT ?? (isWin ? DEFAULT_VAULT_WIN : DEFAULT_VAULT_NIX);

  const levelRaw = (process.env.AGENT_GATEWAY_LOG_LEVEL ?? "info").toLowerCase();
  const logLevel = (["debug", "info", "warn", "error"].includes(levelRaw) ? levelRaw : "info") as Config["logLevel"];

  const tz = process.env.AGENT_GATEWAY_TZ ?? "Asia/Ho_Chi_Minh";

  const httpHost = process.env.AGENT_GATEWAY_HTTP_HOST ?? "127.0.0.1";
  const httpPortRaw = Number(process.env.AGENT_GATEWAY_HTTP_PORT ?? 2091);
  const httpPort = Number.isInteger(httpPortRaw) && httpPortRaw > 0 ? httpPortRaw : 2091;

  const small = Number(process.env.AGENT_GATEWAY_BREAKDOWN_SMALL ?? 800);
  const large = Number(process.env.AGENT_GATEWAY_BREAKDOWN_LARGE ?? 2000);

  const thresholdRaw = Number(process.env.AGENT_GATEWAY_LEARN_THRESHOLD ?? 2);
  const learnThreshold = Number.isInteger(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 2;

  return {
    vaultPath: path.resolve(vaultPath),
    logLevel,
    tz,
    http: {
      host: httpHost,
      port: httpPort,
    },
    breakdown: { small, large },
    learnThreshold,
  };
}
