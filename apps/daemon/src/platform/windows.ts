import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type { ChildProcess } from "node:child_process";

// 杀掉一棵进程树。Windows 下 child.kill() 只杀父进程，孙子进程会变孤儿
// 继续跑（claude 会 spawn bash/node 等工具子进程）。必须用 taskkill /T 递归杀。
// 其他平台 child.kill() 发 SIGTERM 即可。
// 对齐 multica proc_windows.go 同类问题。
export function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (platform() === "win32") {
      // /T 连子进程一起杀；/F 强制（claude 可能不响应温和信号）。
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // 进程已死等情形忽略；调用方不关心。
  }
}
