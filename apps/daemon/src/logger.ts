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
