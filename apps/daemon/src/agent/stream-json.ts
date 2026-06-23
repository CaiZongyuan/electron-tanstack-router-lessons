import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { Logger } from "pino";

// 把一个字节流按行解析成 JSON 对象。
// 用 node:readline 逐行读——它内部就是「按 \n 切 + 处理半行」的行缓冲，
// 不用自己写。每行 JSON.parse，解析失败的行记日志后跳过（不中断流）。
export async function* parseStreamJson<T = unknown>(
  input: Readable,
  logger?: Logger,
): AsyncGenerator<T> {
  const lines = createInterface({
    input,
    crlfDelay: Infinity, // 容忍 \r\n / \n 混合
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // 跳过空行
    try {
      yield JSON.parse(trimmed) as T;
    } catch (err) {
      // 单行解析失败不该让整条流崩——记下继续，便于排查脏数据。
      logger?.warn(
        { line: trimmed.slice(0, 200), err },
        "stream-json: 跳过无法解析的行",
      );
    }
  }
}
