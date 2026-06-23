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
- **GH_TOKEN**：electron-builder 的 publisher 要 `GH_TOKEN`（用内置 `secrets.GITHUB_TOKEN`），即便我们用 softprops 上传也建议设置。
- **permissions: contents: write**：创建 release 必需。
- **上传产物**：`apps/desktop/release/*.exe`（安装包）+ `*.yml`（latest.yml，auto-update 用）+ `*.blockmap`（增量更新）。

> claude 不打包（阶段 7 决策 4B：引导安装），daemon 不含凭证——安装包可公开。

---

## 3. 触发首次发布

```bash
git tag v0.0.1
git push origin v0.0.1
```

push 后到仓库 **Actions** 页看构建进度（约 3–6 分钟），跑完 **Releases** 页会出现 `v0.0.1` 及安装包。也可手动跑（Actions → release → Run workflow），但 release 上传仅在 tag 触发时生效。

---

## 4. 多平台扩展

当前只打 Windows。要 macOS/Linux，复制 job 改 `runs-on` + electron-builder `--mac`/`--linux`，`softprops/action-gh-release` 的 `files` 加对应产物（`*.dmg`/`*.AppImage`）。mac 代码签名需额外证书（Apple Developer），本学习项目先不涉及。

---

## 5. 常见陷阱

1. **pnpm catalog**：CI 的 pnpm 版本要 ≥ 本地（10.x），否则 `catalog:` 解析失败。
2. **frozen-lockfile**：CI 用 `--frozen-lockfile`，lockfile 没提交或过期会失败——所以 `pnpm-lock.yaml` 必须提交且最新。
3. **daemon 没先 build**：electron-builder 的 `extraResources` 拷不到 `main.cjs`，安装包里 daemon 缺失。workflow 顺序已保证。
4. **tag 格式**：workflow 触发条件是 `v*`，tag 必须以 `v` 开头（`v0.0.1`）。
5. **secrets.GITHUB_TOKEN 过期**：它是每个 workflow run 自动生成的，无需手动配。

---

## 6. 验证

- push tag → Actions 页 workflow 绿 ✓。
- Releases 页有 `v0.0.1` + `demo Setup x.y.z.exe` ✓。
- （可选）下载 exe → 干净 Windows 机器装 → 自动检测 claude → 缺失 banner → 对话。
