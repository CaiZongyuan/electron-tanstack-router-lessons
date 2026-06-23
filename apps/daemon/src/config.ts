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
