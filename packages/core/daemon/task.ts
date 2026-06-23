// task HTTP API 的共享类型。daemon 实现，desktop/web 消费。
// 与 backend.ts 的 MessageType 区分：backend 是「agent 原生帧展平」，
// 这里是「task 对外事件」，多了一个 status（task 状态变化）。

export type TaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

// 终止态：done / failed / cancelled。流式订阅据此收尾。
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

// task 级事件类型：backend 的 message 类型 + status（task 状态变化）。
export type TaskEventType =
  | "status" // task 状态变化（pending/running/done/...）
  | "system" // 会话开始（带 session_id）
  | "text" // assistant 文本
  | "thinking" // assistant 思考过程
  | "tool_use" // 工具调用请求
  | "tool_result" // 工具执行结果
  | "log" // 日志
  | "result" // 最终结果（backend 流末尾）
  | "error"; // 解析失败 / 子进程异常

// 单条流式事件（NDJSON 每行一个）。seq 在单 task 内单调递增，从 0 起。
// message 字段（text/tool/...）与 backend Message 一一对应，按 type 选填。
export interface TaskEvent {
  seq: number;
  at: number; // epoch ms
  type: TaskEventType;
  text?: string; // text / thinking / result / error / log
  tool?: string; // tool_use 的工具名
  callId?: string; // tool_use / tool_result 配对的调用 id
  input?: unknown; // tool_use 的入参（原样透传）
  output?: string; // tool_result 的输出
  sessionId?: string; // system / result 的会话 id
  isError?: boolean; // result 是否出错
  level?: string; // log 级别
  status?: TaskStatus; // status 事件携带的新状态
}

// POST /task/run 请求体。
export interface TaskRunRequest {
  prompt: string;
  agent?: string; // 默认 "claude"
  cwd?: string;
  model?: string;
  maxTurns?: number;
}

// POST /task/run 响应。task_id 沿用学习计划验证示例的 snake_case。
export interface TaskRunResponse {
  task_id: string;
}

// task 概要（GET /task/:id 用）。
export interface TaskSummary {
  id: string;
  agent: string;
  status: TaskStatus;
  prompt: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  sessionId?: string;
  error?: string;
}
