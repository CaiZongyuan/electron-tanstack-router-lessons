import { defineConfig } from "tsup";

// 把 daemon 打成单文件 daemon.js：内联 @demo/core 源码 + pino/zod 等所有依赖，
// 这样 prod 模式下 desktop 用 extraResources 拷过去、`node daemon.js` 即可跑，
// 不需要带 node_modules。noExternal: [/.*/] 强制 bundle 全部依赖。
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
});
