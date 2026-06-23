// /health 响应形状。daemon 与 desktop 都 import 这份类型——
// desktop 解析 /health 返回时用 HealthResponse，避免两边字段漂移。

export type HealthStatus = "starting" | "running";

export interface HealthResponse {
  status: HealthStatus;
  pid: number;
  uptimeMs: number;
  healthPort: number;
  logDir: string;
  // 阶段 4 之后填：探测到的 agent provider 列表（如 ["claude"]）
  agents: string[];
  // 阶段 5 之后填：正在执行的 task 数
  activeTaskCount: number;
}
