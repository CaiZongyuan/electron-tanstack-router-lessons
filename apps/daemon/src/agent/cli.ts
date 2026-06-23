// 手动验证 ClaudeBackend：跑通就说明 spawn + stdin + stream-json + abort 全链路 OK。
// 阶段 5 用 task API 取代后可删，或保留作 dev 排查工具。
// 用法：pnpm -C apps/daemon agent:cli "你的问题"
import { loadConfig } from "../config.ts";
import { createLogger } from "../logger.ts";
import { ClaudeBackend } from "./claude.ts";

const prompt = process.argv[2] ?? "用一句话回答：2+2 等于几？";
const config = loadConfig();
const logger = createLogger({ level: config.logLevel, logDir: config.logDir });
const backend = new ClaudeBackend({ logger });

process.stdout.write(`[prompt] ${prompt}\n`);
for await (const msg of backend.execute(prompt)) {
  // 只把人类关心的几类打到 stdout，其余静默避免刷屏。
  if (msg.type === "text") process.stdout.write(`[text] ${msg.text}\n`);
  else if (msg.type === "tool_use")
    process.stdout.write(`[tool_use] ${msg.tool}\n`);
  else if (msg.type === "result")
    process.stdout.write(`[result] ${msg.text} (error=${msg.isError})\n`);
  else if (msg.type === "error") process.stdout.write(`[error] ${msg.text}\n`);
}
