import { Link } from '@tanstack/react-router'
import {
  ArrowUp,
  Bot,
  FileSpreadsheet,
  Plane,
  Plus,
  Presentation,
  ReceiptText,
  Wrench,
} from 'lucide-react'
import { Button } from '@demo/ui/components/ui/button'
import { cn } from '@demo/ui/lib/utils'

const categories = ['推荐', '办公学习', '电脑设置', '生活日常', '游戏娱乐'] as const

const suggestions = [
  {
    title: '深京航班特价速查',
    description: '帮我在飞常准 App 查询一下下周六深圳飞北京的机票，结合时间和价格做个简表。',
    icon: Plane,
    tone: 'bg-info/15 text-info',
  },
  {
    title: '机器人概念核心标的盘点',
    description: '帮我梳理机器人概念板块，按应用方向和风险点整理成便于比较的清单。',
    icon: Bot,
    tone: 'bg-destructive/10 text-destructive',
  },
  {
    title: '百度节秒变 PPT',
    description: '我需要做一个用于宣讲前沿知识的 PPT，先帮我整理可用资料和结构。',
    icon: Presentation,
    tone: 'bg-warning/15 text-warning',
  },
  {
    title: '本地发票整理&报销',
    description: '查找本机最近一个季度的发票文件，识别关键信息后整理为 Excel 表格。',
    icon: ReceiptText,
    tone: 'bg-info/10 text-info',
  },
  {
    title: '5min 速通 arXiv 论文！',
    description: '请帮我深度拆解这篇论文，提取背景、方法、实验和局限。',
    icon: FileSpreadsheet,
    tone: 'bg-muted text-muted-foreground',
  },
  {
    title: '检查本地运行时',
    description: '查看 daemon、agent 和 Claude 配置状态，确认任务可以在本机运行。',
    icon: Wrench,
    tone: 'bg-success/10 text-success',
  },
] as const

export function HomeView() {
  return (
    <div className="scrollbar-none flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-12 pt-24">
        <section className="flex items-center gap-4">
          <div className="flex size-20 items-center justify-center rounded-full border border-border bg-card text-base font-medium">
            LAT
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-medium text-foreground">local-agent-team</h1>
            <p className="text-sm text-muted-foreground">本地 agent 学习工作台，随时把任务交给运行时处理</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Link
            to="/daemon"
            className="block min-h-48 rounded-xl px-2 py-3 text-base text-muted-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            请输入任务，交给我来帮你完成
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-full">
              <Plus className="size-4" />
              选择文件
            </Button>
            <Link
              to="/daemon"
              aria-label="进入对话"
              className="ml-auto inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowUp className="size-4" />
            </Link>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center gap-5">
            {categories.map((category, index) => (
              <button
                key={category}
                className={cn(
                  'text-sm transition-colors hover:text-foreground',
                  index === 0 ? 'font-medium text-foreground' : 'font-normal text-muted-foreground',
                )}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((item) => (
              <button
                key={item.title}
                type="button"
                className="group min-h-40 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start gap-3">
                  <span className={cn('mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md', item.tone)}>
                    <item.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-medium text-foreground">{item.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ArrowUp className="ml-auto mt-5 size-4 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
