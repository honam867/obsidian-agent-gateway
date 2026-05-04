import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import type { Config } from "./config.js";
import { initVault } from "./vault/vault-io.js";
import { registerTools } from "./tools/index.js";
import { log, setLogLevel } from "./utils/logger.js";

export function createAgentGatewayServer(config: Config): Server {
  const server = new Server(
    { name: "obsidian-agent-gateway", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const tools = registerTools({ config });
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    try {
      const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Tool ${req.params.name} failed`, { error: message });
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  });

  return server;
}

export async function initAgentGateway(config: Config): Promise<void> {
  setLogLevel(config.logLevel);
  await initVault(config.vaultPath);
}

export async function runServer(): Promise<void> {
  const config = loadConfig();
  await initAgentGateway(config);

  const server = createAgentGatewayServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`obsidian-agent-gateway ready — vault: ${config.vaultPath}`);
}
