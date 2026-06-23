// daemon 子进程的生命周期管理（desktop main 进程）。
// 状态机 stopped→starting→running/error；running→stopping→stopped。
// 对照 multica daemon-manager：裁掉 CLI 安装/认证/多 profile，只保留
// spawn + poll /health + stop + 状态推送这四个核心动作。
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { join, resolve } from "node:path";
import { app } from "electron";
import type { DaemonStatus } from "@demo/core/daemon/client";
import { getApiKey } from "./claude-installer";

// 与 daemon 默认端口对齐（core DAEMON_HEALTH_PORT_DEFAULT）。
export const DAEMON_HEALTH_PORT = 19514;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 3000;

type StatusListener = (status: DaemonStatus) => void;

type Logger = Pick<Console, "info" | "warn" | "error">;

export class DaemonManager {
  private child: ChildProcess | null = null;
  private status: DaemonStatus = "stopped";
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<StatusListener>();
  private readonly log: Logger;
  // 标记是我们主动 stop（exit handler 据此判 stopped vs error）。
  private intentionalStop = false;

  constructor(log: Logger = console) {
    this.log = log;
  }

  getStatus(): DaemonStatus {
    return this.status;
  }

  onStatusChange(cb: StatusListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async start(): Promise<void> {
    if (this.status === "running" || this.status === "starting") return;
    this.intentionalStop = false;
    this.setStatus("starting");

    // 先探：端口上已有 daemon 在跑（上次残留或外部启动）→ 直接复用，
    // 不重复 spawn——避免 EADDRINUSE 退出造成的「启动即停」。
    if (await this.probeRunning()) {
      this.log.info("[daemon-manager] detected running daemon, reuse");
      this.startPolling();
      this.setStatus("running");
      return;
    }

    const spec = this.resolveSpawnCommand();
    this.log.info(`[daemon-manager] spawn ${spec.cmd} ${spec.args.join(" ")}`);
    // 注入 ANTHROPIC_API_KEY（用户在应用配的）→ daemon → claude 继承。
    const apiKey = getApiKey();
    this.child = spawn(spec.cmd, spec.args, {
      cwd: spec.cwd,
      env: {
        ...process.env,
        DEMO_DAEMON_HEALTH_PORT: String(DAEMON_HEALTH_PORT),
        ...spec.extraEnv,
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
      },
      windowsHide: true,
      // dev: Windows 下 pnpm 是 pnpm.cmd 要 shell；prod: node 直接跑无需 shell。
      shell: spec.useShell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // 把 daemon 子进程日志带前缀转发到主进程 stdout（开发排查用）。
    this.child.stdout?.on("data", (c: Buffer) => process.stdout.write(`[daemon] ${c}`));
    this.child.stderr?.on("data", (c: Buffer) => process.stderr.write(`[daemon] ${c}`));

    this.child.on("exit", (code) => {
      this.log.info(`[daemon-manager] daemon exited code=${code}`);
      this.stopPolling();
      this.child = null;
      // 主动 stop → stopped；意外退出 → error。
      this.setStatus(this.intentionalStop ? "stopped" : "error");
    });
    this.child.on("error", (err) => {
      this.log.error(`[daemon-manager] spawn error: ${err.message}`);
      this.setStatus("error");
    });

    this.startPolling();
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "stopping") return;
    this.intentionalStop = true;
    this.setStatus("stopping");
    this.stopPolling();

    // 优先优雅退出：POST /shutdown（daemon 阶段 3 实现）。
    try {
      await fetch(`http://127.0.0.1:${DAEMON_HEALTH_PORT}/shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(SHUTDOWN_TIMEOUT_MS),
      });
    } catch {
      // 超时或不可达：直接杀进程树兜底。
      if (this.child) killProcessTree(this.child);
    }

    // 等子进程退出；超时则强杀。exit handler 会把状态推到 stopped。
    if (this.child) {
      await waitForExit(this.child, SHUTDOWN_TIMEOUT_MS).catch(() => {
        if (this.child) killProcessTree(this.child);
      });
    }
    this.setStatus("stopped");
  }

  private startPolling(): void {
    this.stopPolling();
    void this.pollOnce(); // 立即一次，缩短 starting→running 反馈
    this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.status !== "starting" && this.status !== "running") return;
    try {
      const res = await fetch(`http://127.0.0.1:${DAEMON_HEALTH_PORT}/health`, {
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });
      const h = (await res.json()) as { status: string };
      if (h.status === "running") this.setStatus("running");
    } catch {
      // starting 中 daemon 还没起来正常；running 后若崩溃由 child exit handler 报 error。
    }
  }

  // 探测端口上是否已有 running 的 daemon（复用，避免重复 spawn 撞端口）。
  private async probeRunning(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${DAEMON_HEALTH_PORT}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      const h = (await res.json()) as { status: string };
      return h.status === "running";
    } catch {
      return false;
    }
  }

  private setStatus(status: DaemonStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const cb of this.listeners) cb(status);
  }

  // dev: pnpm -C <daemonDir> start；prod: electron 自带 Node 跑打包进 resources 的 daemon.cjs。
  private resolveSpawnCommand(): SpawnSpec {
    if (app.isPackaged) {
      return {
        cmd: process.execPath,
        args: [join(process.resourcesPath, "daemon", "daemon.cjs")],
        // ELECTRON_RUN_AS_NODE 让 electron 进程当 Node 跑（不启 GUI）。
        extraEnv: { ELECTRON_RUN_AS_NODE: "1" },
        useShell: false,
      };
    }
    const daemonDir = resolveDaemonDir();
    return {
      cmd: "pnpm",
      args: ["-C", daemonDir, "start"],
      cwd: daemonDir,
      useShell: platform() === "win32",
    };
  }
}

interface SpawnSpec {
  cmd: string;
  args: string[];
  cwd?: string;
  extraEnv?: NodeJS.ProcessEnv;
  useShell?: boolean;
}

// 定位 apps/daemon 目录。electron-vite 编译后 main 的 __dirname 因 dev/prod 而异，
// 列几个候选，按 package.json 是否存在命中。覆盖 dev（cwd=apps/desktop）与
// prod（out/main）两种布局。
function resolveDaemonDir(): string {
  const candidates = [
    resolve(__dirname, "..", "..", "..", "daemon"), // out/main → apps/daemon
    resolve(__dirname, "..", "..", "daemon"), // src/main → apps/daemon（dev 源）
    resolve(process.cwd(), "..", "daemon"), // cwd=apps/desktop
    resolve(process.cwd(), "daemon"), // cwd=apps
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
  }
  console.warn(`[daemon-manager] 未定位到 apps/daemon，回退 cwd 推算`);
  return resolve(process.cwd(), "..", "daemon");
}

// 杀进程树。Windows 下 child.kill 只杀父，孙子进程会孤儿（daemon 会 spawn claude/node），
// 必须 taskkill /T。与 apps/daemon/src/platform/windows.ts 同一思路（这里独立实现，
// desktop main 不依赖 daemon 包）。
function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (platform() === "win32") {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // 进程已死等情形忽略。
  }
}

function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  return new Promise((resolveP, reject) => {
    const timer = setTimeout(() => reject(new Error("exit timeout")), ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveP();
    });
  });
}
