import { randomUUID } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { createAgentGatewayServer, initAgentGateway } from "./server.js";
import { log } from "./utils/logger.js";

type TransportMap = Map<string, StreamableHTTPServerTransport>;

export async function runHttpServer(): Promise<void> {
  const config = loadConfig();
  await initAgentGateway(config);

  const transports: TransportMap = new Map();
  const httpServer = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, transports, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("HTTP MCP request failed", { error: message });
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.http.port, config.http.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  log.info(
    `obsidian-agent-gateway HTTP ready: http://${config.http.host}:${config.http.port}/mcp â€” vault: ${config.vaultPath}`,
  );

  const shutdown = async () => {
    log.info("Shutting down HTTP MCP server");
    for (const [sessionId, transport] of transports) {
      try {
        await transport.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to close transport ${sessionId}`, { error: message });
      }
      transports.delete(sessionId);
    }
    httpServer.close(() => process.exit(0));
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  transports: TransportMap,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  setCorsHeaders(res);

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, transport: "streamable-http" });
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method === "POST") {
    await handleMcpPost(req, res, transports, config);
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    await handleMcpSessionRequest(req, res, transports);
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  transports: TransportMap,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const sessionId = headerValue(req, "mcp-session-id");
  const body = await readJsonBody(req);

  if (sessionId) {
    const existing = transports.get(sessionId);
    if (!existing) {
      sendMcpError(res, 404, -32000, "Session not found");
      return;
    }
    await existing.handleRequest(req, res, body);
    return;
  }

  if (!isInitializeRequest(body)) {
    sendMcpError(res, 400, -32000, "Bad Request: initialize request required");
    return;
  }

  let transport: StreamableHTTPServerTransport;
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
    },
  });

  transport.onclose = () => {
    const closedSessionId = transport.sessionId;
    if (closedSessionId) {
      transports.delete(closedSessionId);
    }
  };

  const mcpServer = createAgentGatewayServer(config);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function handleMcpSessionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  transports: TransportMap,
): Promise<void> {
  const sessionId = headerValue(req, "mcp-session-id");
  if (!sessionId) {
    sendMcpError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    sendMcpError(res, 404, -32000, "Session not found");
    return;
  }

  await transport.handleRequest(req, res);
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;

  return JSON.parse(raw);
}

function sendMcpError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  sendJson(res, status, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
}
