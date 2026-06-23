import type { Logger } from "pino";
import type { Backend, Message } from "../agent/backend.ts";
import type { TaskEvent, TaskStatus } from "@demo/core/daemon/task";
import type { TaskStore } from "./store.ts";

export interface TaskRunnerOpts {
  backend: Backend;
  store: TaskStore;
  logger: Logger;
}

export interface RunInput {
  prompt: string;
  cwd?: string;
  model?: string;
  maxTurns?: number;
}

// task 执行器：把一个 task 喂给 backend，把 message 流转成 store 事件，
// 维护状态机 pending → running → done/failed/cancelled。
// 对照 multica daemon.go::executeAndDrain：`for msg := range session.Messages`。
export class TaskRunner {
  private readonly backend: Backend;
  private readonly store: TaskStore;
  private readonly logger: Logger;

  constructor(opts: TaskRunnerOpts) {
    this.backend = opts.backend;
    this.store = opts.store;
    this.logger = opts.logger;
  }

  // 异步启动一个 task（fire-and-forget）。调用方（router）立即返回 task_id，
  // 执行在后台 drain，错误兜成 failed 态，不向外抛。
  start(id: string, input: RunInput): void {
    const signal = this.store.signal(id);
    if (!signal) {
      this.logger.warn({ taskId: id }, "runner.start: task not found");
      return;
    }
    void this.drain(id, input, signal);
  }

  private async drain(
    id: string,
    input: RunInput,
    signal: AbortSignal,
  ): Promise<void> {
    this.store.setStatus(id, "running", { startedAt: Date.now() });

    let sawResult = false;
    let sawError = false;
    let errorText: string | undefined;
    let sessionId: string | undefined;

    try {
      for await (const msg of this.backend.execute(input.prompt, {
        cwd: input.cwd,
        model: input.model,
        maxTurns: input.maxTurns,
        signal,
      })) {
        if (msg.type === "result") {
          sawResult = true;
          if (msg.sessionId) sessionId = msg.sessionId;
        } else if (msg.type === "error") {
          sawError = true;
          errorText = msg.text;
        }
        this.store.append(id, messageToEvent(msg));
      }
    } catch (err) {
      // backend 内部已尽量自愈（补 error message），这里兜底防漏。
      const text = err instanceof Error ? err.message : String(err);
      this.logger.error({ taskId: id, err }, "runner: backend stream threw");
      this.store.append(id, { type: "error", text: `执行异常：${text}` });
      sawError = true;
      errorText = errorText ?? text;
    }

    // 终态判定：取消优先，再看是否拿到 result、有无 error。
    const finishedAt = Date.now();
    let status: TaskStatus;
    let error: string | undefined;
    if (signal.aborted) {
      status = "cancelled";
    } else if (!sawResult || sawError) {
      status = "failed";
      error = errorText ?? "未产出结果";
    } else {
      status = "done";
    }
    this.store.setStatus(id, status, { finishedAt, sessionId, error });
    this.logger.info({ taskId: id, status }, "task finished");
  }
}

// backend Message → store 事件（seq/at 由 store 补）。
// 两者的 message 字段（text/tool/...）形状一致，直接展开即可。
function messageToEvent(msg: Message): Omit<TaskEvent, "seq" | "at"> {
  return { ...msg };
}
