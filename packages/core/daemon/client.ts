// daemon 客户端接口。共享 chat UI（@demo/views）只依赖这个抽象，
// 不感知底下是 IPC（desktop）还是 fetch（web）。
// 对照 @demo/core/platform/types 的 PlatformCapabilities：那是「瞬时无副作用能力」，
// 这里是「带状态机 + 长流 + 取消」的客户端，语义不同，故单独建接口与 Provider。
import type { TaskEvent, TaskRunRequest, TaskRunResponse } from "./task";

// daemon 进程状态。desktop 端由 daemon-manager 推动流转；web 端靠轮询 /health 推断。
export type DaemonStatus =
  | "stopped" // 未运行
  | "starting" // 已 spawn，/health 尚未 running
  | "running" // /health 返回 running
  | "stopping" // 收到 stop，等待退出
  | "error"; // 启动失败 / 崩溃

// 对外暴露的 health 子集（/health 字段的裁剪，UI 关心这些）。
export interface DaemonHealth {
  status: "starting" | "running";
  agents: string[];
  activeTaskCount: number;
}

// 客户端能力差异。web 端无法管理 daemon 进程（进程由 desktop 或外部启动），
// UI 据此禁用 Start/Stop。
export interface DaemonClientCapabilities {
  manageProcess: boolean;
}

// daemon 客户端抽象。desktop 经 IPC 实现，web 经 fetch 实现。
export interface DaemonClient {
  readonly capabilities: DaemonClientCapabilities;

  // 进程生命周期。desktop: spawn/stop 子进程；web: no-op（manageProcess=false）。
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<DaemonStatus>;
  // 订阅状态变化，返回取消订阅函数。
  onStatusChange(cb: (status: DaemonStatus) => void): () => void;
  // 查询 health；daemon 不可达时返回 null。
  getHealth(): Promise<DaemonHealth | null>;

  // 创建 task，立即返回 task_id（后台执行）。
  runTask(req: TaskRunRequest): Promise<TaskRunResponse>;
  // 订阅 task 事件流直到终止（收到终止 status 事件 resolve）。
  // 调用方 await 它；中途取消应走 cancelTask。
  streamTaskEvents(
    taskId: string,
    onEvent: (event: TaskEvent) => void,
  ): Promise<void>;
  // 取消 task（DELETE）。
  cancelTask(taskId: string): Promise<void>;
  // 检测本机 claude 是否安装（仅 desktop 实现；web 无此能力，不实现该方法）。
  checkClaude?(): Promise<ClaudeStatus>;
  // 读写 claude API key（仅 desktop，存本地；daemon spawn 时注入 ANTHROPIC_API_KEY）。
  saveApiKey?(key: string): Promise<void>;
  getApiKey?(): Promise<string | null>;
}

// claude 安装 + 认证检测结果。desktop main 探测后经 IPC 返回，renderer banner 据此提示。
export interface ClaudeStatus {
  installed: boolean;
  version: string | null;
  error: string | null;
  // 已认证：应用配了 API key，或 claude OAuth 凭证（~/.claude/）存在。
  authenticated: boolean;
}
