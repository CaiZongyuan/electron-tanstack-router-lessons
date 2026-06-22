import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// cn：合并 className，同时解决 Tailwind 类冲突（后者覆盖前者）。
// 所有共享组件用它合并外部传入的 className 与内部默认类。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
