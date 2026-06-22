# 02 · 阶段 1 — monorepo 化

> 目标：把当前「只有一个 `apps/web`」的仓库，改造成 **pnpm workspace**，并为后续加入 `apps/desktop` 和 `packages/*` 做好脚手架。**约束：改造后 `apps/web` 必须照常构建。**

---

## 1. 为什么要 monorepo

第一性原理：web 和 desktop 要**共用代码**。共用代码的前提是，那段代码处在一个「两端都能 `import`」的位置。单仓库里只有一个 `apps/web`，它没法被「另一个 app」引用。所以我们要：

1. 声明一个**工作区**，让仓库内多个目录都成为「可互相引用的包」。
2. 把根目录变成协调者（装构建工具、定义全局脚本），各 app/包各管各的依赖。

这套机制就是 **pnpm workspace**。`packages/*`（共享包）将来放进去后，`apps/web` 和 `apps/desktop` 都能用 `workspace:*` 引用它们——这是 web/desktop 同步开发的物理基础。

---

## 2. 三个核心概念

### 2.1 pnpm workspace（`pnpm-workspace.yaml`）

一行 `packages: [apps/*, packages/*]` 告诉 pnpm：「这两个目录下的每个子目录都是一个独立的包」。之后：

- 仓库根产生**一个** `pnpm-lock.yaml` 和**一个** `node_modules`（按 pnpm 的隔离链接布局）。
- 包 A 可以在 `package.json` 里写 `"@demo/ui": "workspace:*"` 引用包 B，pnpm 会建符号链接，**不走 npm registry**。

> 关键收益：改 `packages/ui` 的源码，`apps/web` 立刻看到——因为引用的是源码符号链接，不是发布产物。这就是「改一处两端生效」的底层保证。

### 2.2 turbo（`turbo.json`）

turbo 是任务编排器。它做两件事：

- **依赖感知**：`build` 任务声明 `dependsOn: ["^build"]`，意思是「先把我依赖的包 build 完，再 build 我」。将来 `@demo/views` 依赖 `@demo/ui`，build 时自动按拓扑顺序。
- **脚本委托**：根 `package.json` 写 `"dev:web": "turbo dev --filter=@demo/web"`，意思是「在名为 `@demo/web` 的包里跑 `dev` 脚本」。`--filter` 精确指定跑哪个包。

`dev` 任务标记 `persistent: true, cache: false`——因为 dev 是长驻进程（dev server），不缓存、不退出。

### 2.3 锁文件归属

改造前：`apps/web` 有自己的 `pnpm-lock.yaml` 和 `node_modules`（它是单仓库时代的产物）。
改造后：**锁文件归仓库根**，`apps/web` 的 lockfile 删掉，`node_modules` 由根 `pnpm install` 统一重建。否则会出现「子包 lockfile 与工作区冲突」。

---

## 3. 操作清单

1. 创建根 `package.json`（协调者，装 turbo，定义全局脚本）。
2. 创建 `pnpm-workspace.yaml`（声明工作区）。
3. 创建 `turbo.json`（任务编排）。
4. 改 `apps/web/package.json`：包名 `web` → `@demo/web`，补一个 `typecheck` 脚本。
5. 删除 `apps/web/pnpm-lock.yaml` 与 `apps/web/node_modules`（让根接管）。
6. 在仓库根执行 `pnpm install`。
7. 验证：`pnpm build`（等价 `turbo build`，会 build `@demo/web`）+ `pnpm typecheck` 通过。

> **本阶段不引入 `catalog:`**。catalog 是「集中锁版本」的高级特性，要等阶段 2 有了多个共享包、需要统一 React 版本时才有价值（YAGNI）。先让 workspace 跑起来，再加复杂度。

---

## 4. 关键文件内容

### 4.1 根 `package.json`

```json
{
  "name": "desktop-web-demo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.12.3",
  "scripts": {
    "dev:web": "turbo dev --filter=@demo/web",
    "build": "turbo build",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.5.4"
  }
}
```

说明：

- `private: true`：根包不发布。
- `type: module`：与子包一致（apps/web 已是 `type: module`）。
- `packageManager`：声明所用 pnpm 版本（corepack 会用它）。
- **故意不写 `dev:desktop`**：`@demo/desktop` 还没建，`--filter` 会报「找不到包」。等阶段 4 建好 desktop 再加这条脚本（不发布一个会报错的脚本，是基本卫生）。

### 4.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`packages/*` 目录还不存在，但提前声明无害——pnpm 只是「将来这个目录下的包都算工作区成员」。

### 4.3 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "test": {
      "dependsOn": ["^typecheck"]
    }
  }
}
```

- `^build` / `^typecheck` 的 `^` 表示「先跑依赖包的同名任务」（拓扑顺序）。
- `outputs: ["dist/**"]`：build 产物缓存目录（Vite 默认输出到 `dist/`）。

### 4.4 `apps/web/package.json` 的两处改动

- `"name": "web"` → `"name": "@demo/web"`（成为工作区正式成员）。
- scripts 里加 `"typecheck": "tsc --noEmit"`（apps/web 的 tsconfig 已是 `noEmit`，补上脚本让 `pnpm typecheck` 能覆盖它）。

其余不动。

---

## 5. 验证（本阶段完成的判据）

```bash
pnpm install            # 根目录安装，应成功且生成根 pnpm-lock.yaml
pnpm build              # 等价 turbo build → @demo/web 构建，产出 dist/
pnpm typecheck          # 等价 turbo typecheck → @demo/web 类型检查
```

三条都通过，且 `apps/web` 不再有独立的 lockfile，即本阶段完成。

---

## 6. 小结

这一步没有加任何业务功能，只搭了「家」。但它是后续一切的前提：有了 workspace，阶段 2 才能把组件抽到 `packages/ui` 并被 `apps/web` 引用；阶段 4 才能加 `apps/desktop` 引用同一批共享包。

monorepo 的本质就一句话：**「让仓库里的包能互相 `import`，并由一个根来统一安装与编排」**。理解了这句，剩下的都是配置细节。
