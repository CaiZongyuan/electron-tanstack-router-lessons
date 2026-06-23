import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  isTerminalTaskStatus,
  type TaskEvent,
  type TaskStatus,
  type TaskSummary,
} from "@demo/core/daemon/task";

type EventSink = (event: TaskEvent) => void;
type TerminalListener = () => void;

// 单个 task 的运行态：元数据 + append-only 历史 + live 订阅 + 取消开关。
// 对照 multica：它把 task 存 PostgreSQL 再批量上报，我们纯内存 + 实时推——
// shell 与 daemon 同机，不需要持久化，也不需要轮询。
interface TaskRecord {
  summary: TaskSummary;
  events: TaskEvent[]; // append-only 历史，订阅者先回放它再接 live
  sinks: Set<EventSink>; // live 订阅者（收到新事件）
  terminalListeners: Set<TerminalListener>; // 终止回调（关 HTTP 流）
  controller: AbortController; // 取消开关：abort → backend signal
  seq: number; // 下一个事件序号
}

export interface CreateTaskInput {
  prompt: string;
  agent: string;
}

export interface TaskStoreOpts {
  maxConcurrent: number;
  logger: Logger;
}

// 内存态 task 存储 + pub/sub。一个 task = 一条 append-only 事件流 + live 订阅。
export class TaskStore {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly maxConcurrent: number;
  private readonly logger: Logger;

  constructor(opts: TaskStoreOpts) {
    this.maxConcurrent = opts.maxConcurrent;
    this.logger = opts.logger;
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  summary(id: string): TaskSummary | undefined {
    const rec = this.tasks.get(id);
    return rec ? { ...rec.summary } : undefined;
  }

  // 创建 task（pending 态）。达并发上限时抛 OverCapacityError。
  create(input: CreateTaskInput): TaskSummary {
    if (this.runningCount() >= this.maxConcurrent) {
      throw new OverCapacityError(this.maxConcurrent);
    }
    const id = `t-${randomUUID().slice(0, 8)}`;
    const summary: TaskSummary = {
      id,
      agent: input.agent,
      status: "pending",
      prompt: input.prompt,
      createdAt: Date.now(),
    };
    this.tasks.set(id, {
      summary,
      events: [],
      sinks: new Set(),
      terminalListeners: new Set(),
      controller: new AbortController(),
      seq: 0,
    });
    this.logger.info({ taskId: id, agent: input.agent }, "task created");
    return summary;
  }

  // 订阅事件流：先同步回放全部历史，再加入 live 订阅。
  // 关键：回放循环与 sinks.add 之间没有 await，runner 的 append 不会插队，
  // 所以不会丢首包、也不会重复（历史与 live 不重叠）。
  subscribe(id: string, sink: EventSink): () => void {
    const rec = this.tasks.get(id);
    if (!rec) return () => {};
    for (const e of rec.events) sink(e); // 同步回放历史
    rec.sinks.add(sink);
    return () => {
      rec.sinks.delete(sink);
    };
  }

  // 注册 task 终止回调。对「注册时已终止」的 task 用 queueMicrotask 触发，
  // 让订阅者先把终止事件 flush 出去再关流。
  onTerminal(id: string, cb: TerminalListener): () => void {
    const rec = this.tasks.get(id);
    if (!rec) return () => {};
    if (isTerminalTaskStatus(rec.summary.status)) {
      queueMicrotask(cb);
      return () => {};
    }
    rec.terminalListeners.add(cb);
    return () => {
      rec.terminalListeners.delete(cb);
    };
  }

  // runner 追加事件：写历史 + 推所有 live 订阅者。
  append(id: string, event: Omit<TaskEvent, "seq" | "at">): void {
    const rec = this.tasks.get(id);
    if (!rec) return;
    const full: TaskEvent = { ...event, seq: rec.seq++, at: Date.now() };
    rec.events.push(full);
    for (const sink of rec.sinks) sink(full);
  }

  // 改 task 状态并追加一条 status 事件；转入终止态时触发 terminalListeners。
  setStatus(
    id: string,
    status: TaskStatus,
    patch?: Partial<TaskSummary>,
  ): void {
    const rec = this.tasks.get(id);
    if (!rec) return;
    Object.assign(rec.summary, patch, { status });
    this.append(id, { type: "status", status });
    if (isTerminalTaskStatus(status)) {
      // 先摘下 listeners 再逐个触发，防止回调内再注册导致重复触发。
      const listeners = rec.terminalListeners;
      rec.terminalListeners = new Set();
      for (const cb of listeners) cb();
    }
  }

  // 取消：触发 controller.abort，runner 收到 signal 后收尾为 cancelled。
  // 已终止的 task 返回 false（无可取消）。
  cancel(id: string): boolean {
    const rec = this.tasks.get(id);
    if (!rec || isTerminalTaskStatus(rec.summary.status)) return false;
    rec.controller.abort();
    return true;
  }

  signal(id: string): AbortSignal | undefined {
    return this.tasks.get(id)?.controller.signal;
  }

  // 取消所有未终止 task——shutdown 时调用，避免孤儿 claude 进程。
  cancelAll(): void {
    for (const rec of this.tasks.values()) {
      if (!isTerminalTaskStatus(rec.summary.status)) {
        rec.controller.abort();
      }
    }
  }

  // 处于 pending / running 的 task 数（/health 的 activeTaskCount 用）。
  runningCount(): number {
    let n = 0;
    for (const r of this.tasks.values()) {
      if (r.summary.status === "pending" || r.summary.status === "running") n++;
    }
    return n;
  }

  summaries(): TaskSummary[] {
    return [...this.tasks.values()].map((r) => ({ ...r.summary }));
  }
}

// 并发上限异常。router 映射成 429。
export class OverCapacityError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`已达并发上限 ${limit}，请等待现有 task 结束`);
    this.name = "OverCapacityError";
    this.limit = limit;
  }
}
