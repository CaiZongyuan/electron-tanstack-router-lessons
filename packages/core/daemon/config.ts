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
