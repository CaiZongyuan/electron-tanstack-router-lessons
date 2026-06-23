# 03 · 阶段 2 — Config + Logger

> 目标：把环境变量与默认值收敛到一个 `Config` 类型，用 pino 替换 `console.log`。**约束：`DEMO_DAEMON_HEALTH_PORT=20000 pnpm dev:daemon` 跑起来，日志里能看到 `healthPort=20000`；日志同时打到 stdout（pretty）和 `~/.demo/daemon/daemon.log`（JSON）。**

---

## 1. 为什么 config 和 logger 放一个阶段

两者都是「跨阶段地基」：

- **Config**：阶段 3 的 `healthPort`、阶段 4 的 `claudeBinaryPath`、阶段 5 的 `maxConcurrentTasks`，全都要从 `Config` 读。
- **Logger**：每个阶段都要打日志，越早把 pino 接好，后续越顺——避免到处是 `console.log` 后面再回头改。

放一起还有一个理由：**阶段 2 之后日志会变多**（pino 每条带 pid / level / time / msg），config 也该稳定下来（后续阶段只加字段，不改架构）。

---

## 2. 三个核心概念

### 2.1 `override > env > default` 模式

来自 multica 的 `config.go::LoadConfig`：

```
default       ← 代码里的硬编码默认值
  ↑ 覆盖
env           ← DEMO_DAEMON_* 环境变量
  ↑ 覆盖
override      ← 构造时显式传的值（CLI flag 之类）
```

本阶段只实现 **default + env** 两层。override 留给阶段 7 打包时（如果需要从 Electron spawn 时传参）。

环境变量前缀 `DEMO_DAEMON_*`（对齐项目名 `@demo/`，不沿用 multica 的 `MULTICA_*`）。

### 2.2 `zod` 校验

env 全是 string，要转 number / enum / 路径。zod 解决三件事：

1. **类型转换**：`z.coerce.number()` 自动 `Number(raw)`，失败时报错。
2. **默认值**：`.default(19514)` 让「未设置」落到默认。
3. **类型推导**：`z.infer<typeof schema>` 直接出 `Config` 类型，不用手写。

**为什么不用 `dotenv` / `convict` / 手写**：

- 手写：每个字段写一遍转换，重复且易错。
- dotenv：只读 `.env` 文件，不做校验，错误仍要自己抓。
- convict：schema 冗长，社区不再活跃。

zod 已经是 TS 生态最主流的校验库（tRPC / Next.js / shadcn 都用），学一次受用。

### 2.3 pino 结构化日志

**为什么 pino 而不是 winston / bunyan / console**：

- **pino 最快**：异步 JSON 序列化，不阻塞事件循环。
- **API 极简**：`logger.info({ k: v }, "msg")`，不用配置 level 方法。
- **语义对应 multica 的 `log/slog`**：slog 是 Go 标准库结构化日志，pino 是 Node 生态对应物。

**多流输出**：dev/prod 同时打到：

1. stdout（pretty 美化，带颜色）——开发时直接看终端
2. 文件（JSON 每行一条）——`~/.demo/daemon/daemon.log`，用于事后排查

> 对比 multica：它用 `slog.SetDefault(slog.NewTextHandler(io.MultiWriter(os.Stdout, logFile), ...))` 做同样的事——pino 的 `pino.multistream([...])` 是等价 API。

---

## 3. 共享类型为什么放 `packages/core`

阶段 6 时，Electron 主进程 spawn daemon 子进程，**两边必须独立算出同一个 `healthPort`**：

- daemon 读自己的 env 得到 `healthPort`，bind 端口。
- Electron 也读同样的 env（或同样的默认值），才知道 HTTP 该发到哪个端口。

两边必须用**同一份**默认值常量、**同一份**解析逻辑。所以 schema 和默认值常量放 `@demo/core/daemon/config.ts`，两边各自 import。

```
packages/core/daemon/config.ts    ← schema + 默认值常量 + 类型
        ↑                ↑
   import           import
   /                    \
apps/daemon           apps/desktop
  (读 env)             (读同样的 env)
```

> 这符合项目原有的包边界约束：`@demo/core` 放「平台无关的共享类型与纯函数」。zod schema 是纯 JS，没碰 Node API，可以放这里。**读 `process.env`** 的 Node 专属逻辑留在 `apps/daemon`。

---

## 4. 操作清单

1. `packages/core`：
   - 新建 `daemon/config.ts`（zod schema + 默认值常量 + `DaemonConfig` 类型）。
   - `package.json` 加 zod 依赖、exports 加 `"./daemon/*"`。
2. `apps/daemon`：
   - 新建 `src/config.ts`（`loadConfig()`：读 `process.env`，调 schema）。
   - 新建 `src/logger.ts`（pino multistream：stdout pretty + 文件 JSON）。
   - 改 `src/main.ts`：用 `loadConfig()` + `createLogger(...)` 替换 `console.log`。
   - `package.json` 加依赖（`pino` / `pino-pretty` / `@demo/core`）。
   - `tsconfig.json` 加 `allowImportingTsExtensions`（允许 `import ... from "./config.ts"`）。
3. `pnpm install`。
4. 验证。

---

## 5. 关键文件内容

### 5.1 `packages/core/daemon/config.ts`

```typescript
import { z } from "zod";

// 默认值常量。Electron 与 daemon 都从这里读，保证两端计算同一个值。
export const DAEMON_HEALTH_PORT_DEFAULT = 19514;
export const DAEMON_LOG_LEVEL_DEFAULT = "info" as const;
export const DAEMON_LOG_DIR_DEFAULT = ""; // 空表示用 ~/.demo/daemon

// env schema：直接吃 process.env 的形状。
// 注意：z.coerce.number() 在 raw 是 "" 时会变成 0，被 min(1) 拒绝；
// 在 raw 是 undefined 时走 .default。
export const daemonEnvSchema = z.object({
  DEMO_DAEMON_HEALTH_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(DAEMON_HEALTH_PORT_DEFAULT),
  DEMO_DAEMON_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default(DAEMON_LOG_LEVEL_DEFAULT),
  DEMO_DAEMON_LOG_DIR: z.string().default(DAEMON_LOG_DIR_DEFAULT),
});

export type DaemonEnv = z.infer<typeof daemonEnvSchema>;

// 实际使用的 config 形状：字段名脱掉前缀 + logDir 兜底。
// daemon 自己用这个；Electron 同样 import 这个类型。
export interface DaemonConfig {
  healthPort: number;
  logLevel: DaemonEnv["DEMO_DAEMON_LOG_LEVEL"];
  logDir: string;
}
```

### 5.2 `packages/core/package.json` diff

```diff
  "exports": {
    "./platform/*": "./platform/*.ts",
-   "./platform/context": "./platform/context.tsx"
+   "./platform/context": "./platform/context.tsx",
+   "./daemon/*": "./daemon/*.ts"
  },
+ "dependencies": {
+   "zod": "^3.23.8"
+ },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
```

zod 版本写 `^3.23.8`——zod 3 是当前稳定大版本，生态成熟。zod 4（如果未来升级）有 breaking change，不急于追。

> zod 放 `dependencies` 不是 `peerDependencies`：zod 体积小（<50KB）、daemon 是 core 的唯一消费方，让 pnpm 自动链接最简。

### 5.3 `apps/daemon/src/config.ts`

```typescript
import { homedir } from "node:os";
import { join } from "node:path";
import {
  daemonEnvSchema,
  type DaemonConfig,
} from "@demo/core/daemon/config";

// 读 process.env，调 core 的 schema 校验，返回 DaemonConfig。
// 失败时 zod 抛 ZodError，错误信息包含所有不合法字段。
export function loadConfig(): DaemonConfig {
  const env = daemonEnvSchema.parse(process.env);
  return {
    healthPort: env.DEMO_DAEMON_HEALTH_PORT,
    logLevel: env.DEMO_DAEMON_LOG_LEVEL,
    // 空字符串表示用默认路径。放在 daemon 而非 core 是因为
    // homedir() 是 Node API，core 不能调。
    logDir: env.DEMO_DAEMON_LOG_DIR || join(homedir(), ".demo", "daemon"),
  };
}
```

### 5.4 `apps/daemon/src/logger.ts`

```typescript
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import pretty from "pino-pretty";

export function createLogger(opts: {
  level: string;
  logDir: string;
}): pino.Logger {
  mkdirSync(opts.logDir, { recursive: true });
  const logFile = join(opts.logDir, "daemon.log");

  // 同步 multistream。不用 pino.transport（worker thread）是因为
  // tsx watch 重启时 worker 退出有延迟，开发体验差；同步模式下
  // 性能差异对一个本地 daemon 来说无所谓。阶段 7 打包时再评估。
  const prettyStream = pretty({
    colorize: true,
    translateTime: "SYS:HH:MM:ss.l",
    ignore: "pid,hostname",
  });
  const fileStream = createWriteStream(logFile, { flags: "a" });

  return pino(
    { level: opts.level },
    pino.multistream([
      { level: opts.level, stream: prettyStream },
      { level: opts.level, stream: fileStream },
    ]),
  );
}
```

要点：

- **`pino.multistream`**：每个 stream 独立接收 pino 序列化后的 JSON 字符串。`prettyStream` 解析 JSON 输出格式化文本到 stdout；`fileStream` 直接写入 JSON 行。
- **`createWriteStream(logFile, { flags: "a" })`**：追加模式，重启 daemon 不覆盖历史日志。
- **不用 `pino.transport`**：transport 用 worker thread，tsx watch 重启时 worker 退出有延迟（已知问题）。同步 multistream 性能稍差但开发体验干净。阶段 7 打包时如需异步可换。

### 5.5 `apps/daemon/src/main.ts`（替换）

```typescript
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";

// 阶段 2 起：config + logger 替换硬编码 console.log。
// 启动最早做的两件事：解析配置、建 logger。所有后续日志都用这个 logger。
const config = loadConfig();
const logger = createLogger({ level: config.logLevel, logDir: config.logDir });

class ShutdownReason extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShutdownReason";
  }
}

const controller = new AbortController();
let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "shutdown triggered");
  controller.abort(new ShutdownReason(reason));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const tick = setInterval(() => {
  logger.info({ pid: process.pid }, "alive");
}, 1000);

controller.signal.addEventListener("abort", () => {
  clearInterval(tick);
  logger.info("bye");
  // fileStream 是异步 write，给 50ms 让 buffer 落盘
  setTimeout(() => process.exit(0), 50);
});

logger.info({ config, pid: process.pid }, "daemon started");
```

差异：

- 顶部加了 `loadConfig()` + `createLogger()`。
- 所有 `console.log` 换成 `logger.info`。
- 启动日志带 `config` 字段，从这条日志能直接看到所有解析后的配置。

### 5.6 `apps/daemon/package.json` diff

```diff
  "dependencies": {
+   "@demo/core": "workspace:*",
+   "pino": "^9.5.0",
+   "pino-pretty": "^11.2.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
```

pino 和 pino-pretty 放 `dependencies`（运行时需要，不是 dev 才用）。

### 5.7 `apps/daemon/tsconfig.json` diff

```diff
  "isolatedModules": true,
  "verbatimModuleSyntax": true,
+ "allowImportingTsExtensions": true,
```

允许 `import { foo } from "./config.ts"`。Bundler 模式下兼容，不影响运行。

---

## 6. 验证

```bash
# 1. 装依赖
pnpm install

# 2. 类型检查（根 turbo 会按依赖顺序 typecheck core → daemon）
pnpm typecheck

# 3. 默认配置启动
pnpm dev:daemon
```

预期 stdout（pino-pretty 美化，带颜色）：

```
HH:MM:ss.l INFO: daemon started
    config: {
      "healthPort": 19514,
      "logLevel": "info",
      "logDir": "C:\\Users\\you\\.demo\\daemon"
    }
    pid: 12345
HH:MM:ss.l INFO: alive
    pid: 12345
...
```

```bash
# 4. env 覆盖验证
DEMO_DAEMON_HEALTH_PORT=20000 DEMO_DAEMON_LOG_LEVEL=debug pnpm dev:daemon
```

预期 config 里 `healthPort: 20000`、`logLevel: "debug"`。

```bash
# 5. 日志文件验证（Windows 路径，Git Bash 下）
cat ~/.demo/daemon/daemon.log
```

预期每行一个 JSON：

```json
{"level":30,"time":1719056400575,"msg":"daemon started","config":{"healthPort":19514,"logLevel":"info","logDir":"..."},"pid":12345}
{"level":30,"time":1719056401575,"msg":"alive","pid":12345}
```

```bash
# 6. 非法值验证
DEMO_DAEMON_HEALTH_PORT=not-a-number pnpm dev:daemon
```

预期 zod 报错：`Expected number, received nan`（或类似），进程退出。

---

## 7. 常见陷阱

### 7.1 `z.coerce.number()` 对空字符串的行为

**症状**：`DEMO_DAEMON_HEALTH_PORT=`（空字符串）报错 "number must be greater than or equal to 1"，而不是 "must be a number"。

**根因**：zod 的 `.default()` 只在值为 `undefined` 时生效。空字符串 `""` 是「已设置」，走 coerce 变 `0`，被 `min(1)` 拒绝。

**解法**：接受这个边界。如果想要「空字符串视为未设置」，改 schema：

```typescript
DEMO_DAEMON_HEALTH_PORT: z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.coerce.number().int().min(1).max(65535).default(19514)
),
```

不推荐——增加认知负担，不如让用户把环境变量删干净。

### 7.2 `pino-pretty` 不打日志

**症状**：stdout 看不到日志，但文件里有。

**根因**：`pino-pretty` 默认是异步刷新（`destination: 1` 是 stdout 但有缓冲）。process 退出太快来不及 flush。

**解法**：本阶段代码在 abort handler 里 `setTimeout(() => process.exit(0), 50)`，给了 flush 时间。如果仍丢日志，加大到 200ms。

### 7.3 tsx watch + pino multistream 导致旧日志重复

**症状**：改代码后日志里看到两次相同的行。

**根因**：tsx watch 重启时旧进程可能没立刻退出（fileStream 还在 flush），新进程已经开始写同一个文件。

**解法**：开发期可忽略。如果烦，把 `DEMO_DAEMON_LOG_DIR` 指向 `/tmp` 或换 dev 时不写文件。

### 7.4 `verbatimModuleSyntax` 报错 `import { type X }` 必须用 `import type`

**症状**：tsc 报错 `'X' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled`。

**根因**：`verbatimModuleSyntax: true` 强制类型与值分开。

**解法**：`import { daemonEnvSchema, type DaemonConfig } from "..."`——值和类型混在一个 import 语句里时，类型加 `type` 修饰符。本阶段代码已经这么写。

### 7.5 Windows 路径里的 `~`

**症状**：`cat ~/.demo/daemon/daemon.log` 在 PowerShell 找不到文件。

**根因**：Node 的 `os.homedir()` 在 Windows 下返回 `C:\Users\you`，但 PowerShell / cmd 不展开 `~`。只有 Git Bash / WSL 展开。

**解法**：PowerShell 用 `cat $env:USERPROFILE\.demo\daemon\daemon.log`，或直接在资源管理器地址栏粘贴 `%USERPROFILE%\.demo\daemon`。

---

## 8. 本阶段产出清单

- [ ] `packages/core/daemon/config.ts`（schema + 默认值 + 类型）
- [ ] `packages/core/package.json` 加 zod + exports
- [ ] `apps/daemon/src/config.ts`
- [ ] `apps/daemon/src/logger.ts`
- [ ] `apps/daemon/src/main.ts` 替换为用 config + logger
- [ ] `apps/daemon/package.json` 加依赖
- [ ] `apps/daemon/tsconfig.json` 加 `allowImportingTsExtensions`
- [ ] `pnpm install` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm dev:daemon` 启动看到 pino 美化日志，config 内容正确
- [ ] `DEMO_DAEMON_HEALTH_PORT=20000` 能覆盖默认
- [ ] `~/.demo/daemon/daemon.log` 写入 JSON 行

---

**下一步**：跑通验证后告诉我，进阶段 3（Health HTTP server：19514 端口 + `/health` + `/shutdown`）。
