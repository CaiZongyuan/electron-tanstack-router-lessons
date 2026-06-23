// 检测本机 claude code 是否安装。desktop main 独立实现一份
// （不依赖 daemon 包的 probeClaude——desktop main 不 import daemon）。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { delimiter } from "node:path";
import { platform } from "node:os";
import type { ClaudeStatus } from "@demo/core/daemon/client";

const execFileP = promisify(execFile);
const isWin = platform() === "win32";

// GUI 应用继承的 PATH 通常不含 npm global 目录（Windows %APPDATA%\npm），
// 导致 spawn 不到 claude。探测 npm prefix 并追加进 PATH。
async function resolveCliEnv(): Promise<NodeJS.ProcessEnv> {
  const pathParts = (process.env.PATH ?? "").split(delimiter);
  try {
    const { stdout } = await execFileP("npm", ["config", "get", "prefix"], {
      windowsHide: true,
      timeout: 5000,
      shell: isWin,
    });
    const prefix = stdout.trim();
    if (prefix) {
      // Windows: prefix 本身就是 bin 目录（%APPDATA%\npm）；POSIX: prefix/bin。
      pathParts.push(isWin ? prefix : `${prefix}/bin`);
    }
  } catch {
    // npm 不可达，PATH 原样。
  }
  return { ...process.env, PATH: pathParts.filter(Boolean).join(delimiter) };
}

// 检测 claude：spawn `claude --version`（带探测后的 PATH）。
export async function checkClaude(): Promise<ClaudeStatus> {
  const env = await resolveCliEnv();
  try {
    const { stdout } = await execFileP("claude", ["--version"], {
      env,
      windowsHide: true,
      timeout: 8000,
      shell: isWin,
    });
    const m = stdout.trim().match(/(\d+\.\d+\.\d+)/);
    return { installed: true, version: m?.[1] ?? stdout.trim(), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: false, version: null, error: msg };
  }
}
