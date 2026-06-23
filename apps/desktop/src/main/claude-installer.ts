// 检测本机 claude code 安装 + 认证状态。desktop main 独立实现一份
// （不依赖 daemon 包的 probeClaude——desktop main 不 import daemon）。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { delimiter, join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { app } from "electron";
import type { ClaudeStatus } from "@demo/core/daemon/client";

const execFileP = promisify(execFile);
const isWin = platform() === "win32";

// API key 存 desktop userData（本地工具，明文 + 0600 权限，不进 git）。
const apiKeyFile = (): string => join(app.getPath("userData"), "anthropic-key");

export function getApiKey(): string | null {
  try {
    const v = readFileSync(apiKeyFile(), "utf8").trim();
    return v || null;
  } catch {
    return null;
  }
}

export function saveApiKey(key: string): void {
  writeFileSync(apiKeyFile(), key, { mode: 0o600 });
}

// 认证状态：应用配了 API key，或 claude OAuth 凭证（终端 claude 登过）存在。
export function isClaudeAuthenticated(): boolean {
  if (getApiKey()) return true;
  return existsSync(join(homedir(), ".claude", ".credentials.json"));
}

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

// 检测 claude：spawn `claude --version`（带探测后的 PATH）+ 认证状态。
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
    return {
      installed: true,
      version: m?.[1] ?? stdout.trim(),
      error: null,
      authenticated: isClaudeAuthenticated(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: false, version: null, error: msg, authenticated: false };
  }
}
