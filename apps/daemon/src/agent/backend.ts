// Backend 接口与统一事件类型。
// task runner（阶段 5）只依赖这里的抽象，不依赖具体 coding-agent CLI。
// 对照 multica server/pkg/agent/agent.go 的 Backend interface。

// 统一事件类型。把 claude / codex 各自的原生流式帧「展平」成这一种。
// 新增 agent 时只需写「原生帧 → Message」的转换，下游不变。
export type MessageType =
  | "system" // 会话开始（带 session_id）
  | "text" // assistant 文本
  | "thinking" // assistant 思考过程
  | "tool_use" // 工具调用请求
  | "tool_result" // 工具执行结果
  | "log" // 日志
  | "result" // 最终结果（流的最后一帧）
  | "error"; // 解析失败 / 子进程异常

export interface Message {
  type: MessageType;
  text?: string; // text / thinking / result / error 的文本
  tool?: string; // tool_use 的工具名
  callId?: string; // tool_use / tool_result 配对的调用 id
  input?: unknown; // tool_use 的入参（原样透传，结构因工具而异）
  output?: string; // tool_result 的输出
  sessionId?: string; // system / result 的会话 id
  isError?: boolean; // result 是否出错
  level?: string; // log 级别
}

// 单次执行选项。阶段 4 实际只用 signal + cwd；model/maxTurns 留扩展位。
export interface ExecOptions {
  cwd?: string;
  model?: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

// agent 后端抽象。execute 返回事件流；result 作为流末尾的 Message。
// 对照 multica：Go 的 Execute 返回 *Session{Messages, Result} 双 channel，
// TS 用单个 AsyncIterable<Message>，result 作为最后一条 type:"result" 收尾。
export interface Backend {
  execute(prompt: string, opts?: ExecOptions): AsyncIterable<Message>;
}
