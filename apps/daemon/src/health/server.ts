import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Logger } from "pino";
import type { HealthResponse } from "@demo/core/daemon/health";

// daemon 运行时状态。main.ts 持有，server 通过 getState() 读。
export interface DaemonRuntimeState {
  startedAt: number;
  ready: boolean;
  logDir: string;
  agents: string[]; // 阶段 4：探测到的可用 agent（如 ["claude"]）
  // 后续阶段填充：activeTaskCount
}

export interface HealthServerDeps {
  port: number;
  logger: Logger;
  getState: () => DaemonRuntimeState;
  shutdown: (reason: string) => void;
}

export async function startHealthServer(
  deps: HealthServerDeps,
): Promise<Server> {
  const server = createServer(createHandler(deps));

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      deps.logger.info(
        { addr: `127.0.0.1:${deps.port}` },
        "health server listening",
      );
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(deps.port, "127.0.0.1");
  });

  return server;
}

function createHandler(deps: HealthServerDeps) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return healthHandler(res, deps);
      }
      if (req.method === "POST" && url.pathname === "/shutdown") {
        return shutdownHandler(res, deps);
      }
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not found", path: url.pathname }));
    } catch (err) {
      deps.logger.error({ err, path: url.pathname }, "health handler error");
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "internal" }));
      }
    }
  };
}

function healthHandler(res: ServerResponse, deps: HealthServerDeps) {
  const state = deps.getState();
  const body: HealthResponse = {
    status: state.ready ? "running" : "starting",
    pid: process.pid,
    uptimeMs: Date.now() - state.startedAt,
    healthPort: deps.port,
    logDir: state.logDir,
    agents: state.agents,
    activeTaskCount: 0,
  };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function shutdownHandler(res: ServerResponse, deps: HealthServerDeps) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "shutting down" }));
  // 响应 flush 后再 abort，否则 server.close() 会立刻断连。
  // setImmediate 把回调推到下一 tick，让 res.end() 的字节先发出去。
  setImmediate(() => deps.shutdown("http-shutdown"));
}
