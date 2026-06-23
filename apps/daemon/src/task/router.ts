import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "pino";
import type { TaskRunRequest } from "@demo/core/daemon/task";
import { OverCapacityError, type TaskStore } from "./store.ts";
import type { TaskRunner } from "./runner.ts";

export interface TaskRouterDeps {
  store: TaskStore;
  runner: TaskRunner;
  logger: Logger;
}

const NDJSON = "application/x-ndjson";
const JSON_TYPE = "application/json";
const MAX_BODY_BYTES = 64 * 1024; // prompt 不会太大，64KB 足够且防滥用

// 处理 /task/* 路由。返回 true 表示已处理（health handler 据此跳过 404）。
// 注入 deps，让 health server 不直接依赖 task 模块（依赖倒置）。
export function handleTaskRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: TaskRouterDeps,
): boolean {
  if (!url.pathname.startsWith("/task")) return false;
  try {
    if (req.method === "POST" && url.pathname === "/task/run") {
      void runTask(req, res, deps); // 异步读 body + 执行，handler 立即放行
      return true;
    }
    // GET /task/:id/events —— NDJSON 流式
    const eventsMatch = url.pathname.match(/^\/task\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      streamEvents(res, deps, eventsMatch[1] ?? "");
      return true;
    }
    // /task/:id（DELETE 取消 / GET 概要）
    const idMatch = url.pathname.match(/^\/task\/([^/]+)$/);
    if (idMatch) {
      const id = idMatch[1] ?? "";
      if (req.method === "DELETE") return cancelTask(res, deps, id);
      if (req.method === "GET") return getTask(res, deps, id);
    }
    return notFound(res, url.pathname);
  } catch (err) {
    deps.logger.error({ err, path: url.pathname }, "task route error");
    return sendJson(res, 500, { error: "internal" });
  }
}

// POST /task/run：建 task → 异步启动 → 立即返回 task_id。
// 注意：这是 async Promise<void>，内部用「sendJson(...); return;」提前退出，
// 不能像同步路径那样 `return sendJson(...)`（后者靠 boolean 给 handleTaskRoute 返回 true）。
async function runTask(req: IncomingMessage, res: ServerResponse, deps: TaskRouterDeps): Promise<void> {
  try {
    const body = await readJson(req);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      sendJson(res, 400, { error: "prompt 必填且非空" });
      return;
    }

    const input: TaskRunRequest = {
      prompt,
      agent: typeof body.agent === "string" ? body.agent : "claude",
      cwd: typeof body.cwd === "string" ? body.cwd : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      maxTurns: typeof body.maxTurns === "number" ? body.maxTurns : undefined,
    };

    let summary;
    try {
      summary = deps.store.create({ prompt: input.prompt, agent: input.agent ?? "claude" });
    } catch (err) {
      if (err instanceof OverCapacityError) {
        sendJson(res, 429, { error: err.message, retry_after_ms: 1000 });
        return;
      }
      throw err;
    }

    // 异步启动；router 不等它，立即返回 task_id（202 Accepted）。
    deps.runner.start(summary.id, input);
    sendJson(res, 202, { task_id: summary.id });
  } catch (err) {
    if (res.writableEnded) return;
    if (err instanceof BadRequestError) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    deps.logger.error({ err }, "runTask failed");
    sendJson(res, 500, { error: "internal" });
  }
}

// GET /task/:id/events：NDJSON 流式。
// 订阅时先同步回放历史（含可能已存在的终止 status），再接 live；
// onTerminal 在 task 终止时关流；客户端断开时清理订阅防泄漏。
function streamEvents(res: ServerResponse, deps: TaskRouterDeps, id: string): void {
  const rec = deps.store.get(id);
  if (!rec) {
    sendJson(res, 404, { error: "task not found", task_id: id });
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-type", NDJSON);
  res.setHeader("cache-control", "no-cache");
  res.flushHeaders(); // 先把 header 发出去，再回放历史

  const off = deps.store.subscribe(id, (e) => writeNdjson(res, e));
  const offTerm = deps.store.onTerminal(id, () => {
    off();
    if (!res.writableEnded) res.end();
  });

  // 客户端中途断开：清理订阅，避免 sink 指向已关闭的 res。
  res.on("close", () => {
    off();
    offTerm();
  });
}

// DELETE /task/:id：触发 abort，runner 收尾为 cancelled。
function cancelTask(res: ServerResponse, deps: TaskRouterDeps, id: string): boolean {
  const rec = deps.store.get(id);
  if (!rec) return sendJson(res, 404, { error: "task not found", task_id: id });
  if (!deps.store.cancel(id)) {
    return sendJson(res, 409, {
      error: "task already finished",
      task_id: id,
      status: rec.summary.status,
    });
  }
  return sendJson(res, 202, { task_id: id, status: "cancelled" });
}

// GET /task/:id：task 概要（排查用）。
function getTask(res: ServerResponse, deps: TaskRouterDeps, id: string): boolean {
  const summary = deps.store.summary(id);
  if (!summary) return sendJson(res, 404, { error: "task not found", task_id: id });
  return sendJson(res, 200, summary);
}

// ---- helpers ----

function writeNdjson(res: ServerResponse, event: unknown): void {
  if (res.writableEnded) return;
  res.write(`${JSON.stringify(event)}\n`);
}

function sendJson(res: ServerResponse, status: number, body: unknown): boolean {
  res.statusCode = status;
  res.setHeader("content-type", JSON_TYPE);
  res.end(JSON.stringify(body));
  return true;
}

function notFound(res: ServerResponse, path: string): boolean {
  return sendJson(res, 404, { error: "not found", path });
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

// 读 + 解析 JSON body。超限 / 非法 JSON 抛 BadRequestError。
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try {
    const parsed = JSON.parse(buf.toString("utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new BadRequestError("请求体不是合法 JSON");
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BadRequestError(`请求体超过 ${MAX_BODY_BYTES} 字节`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
