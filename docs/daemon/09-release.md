# 09 · 发布到 GitHub Releases（CI 自动打包）

> 阶段 7 在本地用 electron-builder 打包时，下载 winCodeSign/nsis 等附加二进制常超时。本文讲怎么改成 **GitHub Actions CI**：push 一个 tag，Windows runner 自动打包并发布到仓库的 Releases 页。

---

## 1. 为什么用 CI 而非本地

| | 本地打包 | GitHub Actions CI |
|---|---|---|
| 下载 winCodeSign/nsis | 常超时（国内网络） | runner 在 GitHub 数据中心，顺畅 |
| 触发 | 手动跑长命令 | `git push origin v0.0.1` |
| 多平台 | 要多台机器 | 加 job 即可 mac/linux |
| 可复现 | 依赖本机环境 | 锁定 runner + lockfile |

结论：CI 更可靠、更标准。本地只保留 dev 用。

---

## 2. workflow 设计（`.github/workflows/release.yml`）

```
push tag v* ──> windows-latest runner
                 ├─ checkout
                 ├─ pnpm 10 + node 20
                 ├─ pnpm install --frozen-lockfile
                 ├─ pnpm --filter @demo/daemon build        # 打 daemon.cjs
                 ├─ electron-vite build                    # main/preload/renderer
                 ├─ electron-builder                       # win nsis 安装包
                 └─ softprops/action-gh-release            # 上传到 Releases
```

关键点：
- **顺序**：必须先 `daemon build`（产 `apps/daemon/dist/main.cjs`），再 electron-builder（`extraResources` 才有东西可拷）。
- **不要给 electron-builder 传 `GH_TOKEN`**：一旦设了，它会尝试自动 publish（需从 `.git/config` 或 `package.json#repository` 检测仓库），CI 里检测不到就报 `Cannot detect repository`。这里只让它**打包**，上传交给 `softprops/action-gh-release`（用内置 `GITHUB_TOKEN`，更可控）。
- **permissions: contents: write**：创建 release 必需。
- **上传产物**：`apps/desktop/release/*.exe`（安装包）+ `*.yml`（latest.yml，auto-update 用）+ `*.blockmap`（增量更新）。

> claude 不打包（阶段 7 决策 4B：引导安装），daemon 不含凭证——安装包可公开。

---

## 3. 发版流程（正确姿势）

每次发版三步——**先对齐版本号，再打 tag**：

```bash
# 1. 改 apps/desktop/package.json 的 version（与将要打的 tag 一致）
#    要发 v0.0.2 → version 改成 "0.0.2"
#    （安装包名取自这里：demo.Setup.<version>.exe）

# 2. 提交版本号并推 main
git commit -am "chore: bump version 0.0.2"
git push origin main

# 3. 打 tag 并推送 → 触发 CI
git tag -a v0.0.2 -m "v0.0.2: 简短说明"
git push origin v0.0.2
```

push tag 后到仓库 **Actions** 页看构建（约 3–6 分钟），跑完 **Releases** 页自动出现该版本及安装包。也可手动跑（Actions → release → Run workflow）只验证构建、不打 release（上传 step 仅 tag 触发时执行）。

> **version 与 tag 必须一致**：安装包名是 `demo.Setup.<package.json#version>.exe`，release 名是 tag。不一致会出现「release 叫 v0.0.1、安装包却叫 0.0.0」（本项目 v0.0.1 首版的遗留），不影响安装但不好看。

> **重发同一版本**：tag 已推又要改，先删再重打：
> `git tag -d v0.x && git push origin :refs/tags/v0.x`，改完 `git tag -a v0.x -m "..." && git push origin v0.x`。

---

## 4. 多平台扩展

当前只打 Windows。要 macOS/Linux，复制 job 改 `runs-on` + electron-builder `--mac`/`--linux`，`softprops/action-gh-release` 的 `files` 加对应产物（`*.dmg`/`*.AppImage`）。mac 代码签名需额外证书（Apple Developer），本学习项目先不涉及。

---

## 5. 常见陷阱（含实战踩坑）

1. **`Multiple versions of pnpm specified`**（实测首跑踩中）：`package.json` 已有 `packageManager: "pnpm@10.12.3"`，`pnpm/action-setup` 再写 `version: 10` 就冲突。**解法**：action 不写 `version`，读 `packageManager`。
2. **`Cannot detect repository by .git/config`**（实测二跑踩中）：electron-builder 检测到 `GH_TOKEN` 就自动 publish，CI 的 `.git/config` / `package.json#repository` 让它找不到仓库。**解法**：package step 不传 `GH_TOKEN`，只打包；上传交 `softprops/action-gh-release`。
3. **version 与 tag 不一致**：见第 3 节，安装包名取自 `package.json#version`，发版前要对齐 tag。
4. **pnpm catalog**：CI 的 pnpm 版本要 ≥ 本地（10.x），否则 `catalog:` 解析失败。
5. **frozen-lockfile**：CI 用 `--frozen-lockfile`，`pnpm-lock.yaml` 没提交或过期会失败——必须提交且最新。
6. **daemon 没先 build**：electron-builder 的 `extraResources` 拷不到 `main.cjs`，安装包里 daemon 缺失。workflow 顺序已保证。
7. **tag 格式**：触发条件是 `v*`，tag 必须以 `v` 开头。
8. **Node 20 deprecated**：`actions/setup-node@v4` 等正被逐步强制到 Node 24，`node-version` 建议升 `22`（不阻塞，仅警告）。

---

## 6. 验证（v0.0.1 已实测通过）

- ✅ push tag → Actions workflow 全绿：Setup pnpm → Node → install → daemon build → desktop build → package → upload，每步 ✓（约 3–4 分钟）。
- ✅ Releases 页出现 `v0.0.1` + `demo.Setup.0.0.0.exe` + `.blockmap` + `builder-debug.yml`。
- 🌐 https://github.com/CaiZongyuan/electron-tanstack-router-lessons/releases/tag/v0.0.1
- ⚠️ 安装包叫 `0.0.0` 是首版没对齐 `version` 与 tag（见陷阱 3），后续发版按第 3 节流程对齐即可。
- （待人工）下载 exe → 干净 Windows 机器装 → 自动检测 claude → 缺失 banner → 装好 claude → 对话。
