import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// claude 最小版本要求，对齐 multica version.go::MinVersions["claude"]。
// stream-json 协议在 2.0.0 起稳定。
const MIN_CLAUDE_VERSION = "2.0.0";

export interface ProbeResult {
  available: boolean;
  binary: string;
  version: string | null;
  // 不满足最小版本 / 没装时填；UI 用来提示安装或升级。
  error: string | null;
}

// 探测 claude 是否在 PATH + 版本是否达标。daemon 启动 preflight 调一次，
// 结果填进 health 的 agents 字段，并决定是否在 UI 提示安装/升级。
export async function probeClaude(binary = "claude"): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileP(binary, ["--version"], {
      windowsHide: true,
      timeout: 5000,
    });
    const version = extractVersion(stdout);
    if (!version) {
      return {
        available: false,
        binary,
        version: null,
        error: "无法解析 claude 版本号",
      };
    }
    if (!meetsMin(version, MIN_CLAUDE_VERSION)) {
      return {
        available: false,
        binary,
        version,
        error: `claude ≥ ${MIN_CLAUDE_VERSION} 才支持 stream-json，当前 ${version}`,
      };
    }
    return { available: true, binary, version, error: null };
  } catch (err) {
    // ENOENT = 没装；超时等也归为不可用。
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, binary, version: null, error: msg };
  }
}

// `claude --version` 输出形如 "2.1.0 (claude code)"，取第一段语义版本。
function extractVersion(stdout: string): string | null {
  const m = stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return m?.[1] ?? null; // m[1] 在 noUncheckedIndexedAccess 下是 string|undefined，归一成 null
}

// 简易语义版本比较：逐段比数字。够用，不引 semver 依赖。
function meetsMin(version: string, min: string): boolean {
  const v = version.split(".").map(Number);
  const m = min.split(".").map(Number);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true; // 相等也算达标
}
