// claude code 安装检测 + 配置（编辑 ~/.claude/settings.json）。desktop main 独立实现。
// 关键：claude 自己读 settings.json 的 env 块，daemon 不注入 env——应用只是该文件的 GUI 编辑器。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { delimiter, join } from "node:path";
import { homedir, platform } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ClaudeStatus } from "@demo/core/daemon/client";

const execFileP = promisify(execFile);
const isWin = platform() === "win32";

// ---- claude settings.json（~/.claude/settings.json）----

export interface ClaudeSettings {
  env?: Record<string, string>;
  permissions?: { allow?: string[]; deny?: string[] };
  [k: string]: unknown;
}

export function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function readClaudeSettings(): ClaudeSettings {
  try {
    return JSON.parse(readFileSync(claudeSettingsPath(), "utf8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

export function writeClaudeSettings(s: ClaudeSettings): void {
  mkdirSync(join(homedir(), ".claude"), { recursive: true });
  writeFileSync(claudeSettingsPath(), `${JSON.stringify(s, null, 2)}\n`, { mode: 0o600 });
}

// 智谱（bigmodel）Anthropic 兼容默认 env。用户只需填 ANTHROPIC_AUTH_TOKEN。
// 注意：智谱用 AUTH_TOKEN（非 API_KEY）。
export const ZHIPU_DEFAULT_ENV: Record<string, string> = {
  ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
  ANTHROPIC_MODEL: "glm-5.2",
  ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5.2",
  ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: "glm-5.2",
  ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.2",
  ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: "glm-5.2",
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.7",
  ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: "glm-4.7",
  ANTHROPIC_DEFAULT_FABLE_MODEL: "glm-5.2",
  ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: "glm-5.2",
};

// 把智谱默认 env + 用户 token 合并进 settings.json（保留 permissions / alwaysThinkingEnabled 等）。
export function applyZhipuConfig(token: string): ClaudeSettings {
  const current = readClaudeSettings();
  const next: ClaudeSettings = {
    ...current,
    env: {
      ...current.env,
      ...ZHIPU_DEFAULT_ENV,
      ANTHROPIC_AUTH_TOKEN: token,
    },
  };
  writeClaudeSettings(next);
  return next;
}

// 认证检测：settings.env 有 token（AUTH_TOKEN 或 API_KEY）+ BASE_URL。
export function isClaudeAuthenticated(): boolean {
  const env = readClaudeSettings().env ?? {};
  return Boolean(
    (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY) && env.ANTHROPIC_BASE_URL,
  );
}

// 读配置信息（给 UI 显示路径 + 内容 + 认证状态）。
export function readClaudeConfigInfo(): {
  path: string;
  content: string;
  exists: boolean;
  authenticated: boolean;
} {
  const path = claudeSettingsPath();
  const exists = existsSync(path);
  let content = "";
  if (exists) {
    try {
      content = readFileSync(path, "utf8");
    } catch {
      content = "";
    }
  }
  return { path, content, exists, authenticated: isClaudeAuthenticated() };
}

// ---- 安装检测 ----

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
