import type { Server } from "node:http";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { probeClaude } from "./agent/probe.ts";
import {
  startHealthServer,
  type DaemonRuntimeState,
} from "./health/server.ts";

const config = loadConfig();
const logger = createLogger({
  level: config.logLevel,
  logDir: config.logDir,
});

class ShutdownReason extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShutdownReason";
  }
}

const controller = new AbortController();

// daemon 运行时状态。所有 mutate 都在 main.ts，server 通过 getState 读。
const runtime: DaemonRuntimeState = {
  startedAt: Date.now(),
  ready: false,
  logDir: config.logDir,
  agents: [], // probeClaude 后填充
};

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "shutdown triggered");
  controller.abort(new ShutdownReason(reason));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 启动 HTTP server。端口被占（另一个 daemon 在跑）时清晰报错退出。
let healthServer: Server | undefined;
try {
  healthServer = await startHealthServer({
    port: config.healthPort,
    logger,
    getState: () => runtime,
    shutdown,
  });
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "EADDRINUSE") {
    logger.error(
      { port: config.healthPort },
      "another daemon is already running; set DEMO_DAEMON_HEALTH_PORT to use a different port",
    );
    process.exit(1);
  }
  logger.error({ err }, "failed to start health server");
  process.exit(1);
}

// preflight：探测 claude。这一步有延迟（spawn 一次 CLI），所以放在
// health server 起来之后、ready 之前——liveness 已就绪，readiness 等探测完。
const claude = await probeClaude();
if (claude.available) {
  runtime.agents = ["claude"];
  logger.info({ version: claude.version }, "claude detected");
} else {
  logger.warn(
    { err: claude.error },
    "claude not available; agent tasks will fail",
  );
}
runtime.ready = true;
logger.info("daemon ready");

// 主循环：每 5 秒打一行 alive。health server 已接管 liveness，
// 这里只是开发时看 daemon 还在的视觉信号。阶段 5 之后会被 task loop 替换。
const tick = setInterval(() => {
  logger.debug("alive");
}, 5000);

controller.signal.addEventListener("abort", () => {
  clearInterval(tick);
  healthServer?.close();
  logger.info("bye");
  setTimeout(() => process.exit(0), 50);
});

logger.info({ config }, "daemon started");
