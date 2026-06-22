import { Bot, FolderKanban, Inbox, ListTodo, Sparkles } from 'lucide-react'
import { usePlatformCapabilities } from '@demo/core/platform/context'
import { Button } from '@demo/ui/components/ui/button'
import { PageHeader } from '../layout/page-header'

const cards = [
  {
    title: '收件箱',
    description: '查看最近流入当前工作区的事项与协作信号。',
    icon: Inbox,
  },
  {
    title: '事项',
    description: '按列表、看板或泳道继续组织团队当前的工作流。',
    icon: ListTodo,
  },
  {
    title: '项目',
    description: '把零散事项聚合到更稳定的项目结构与目标下。',
    icon: FolderKanban,
  },
  {
    title: '智能体',
    description: '为工作区准备自动化执行和辅助协作的运行单元。',
    icon: Bot,
  },
] as const

export function HomeView() {
  const { openExternal } = usePlatformCapabilities()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader className="gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">工作区总览</h1>
      </PageHeader>

      <div className="flex flex-1 min-h-0 flex-col gap-6 overflow-y-auto p-4 md:p-6">
        <section className="rounded-xl border border-border bg-card p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Multica 风格主界面壳</p>
              <h2 className="text-base font-medium">从共享页面，进入共享 dashboard</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                这一阶段先复刻主结构：左侧工作区导航、顶部页头、内容卡片区域。业务数据仍然用静态骨架，
                重点先放在分层与界面密度，而不是复杂交互。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => openExternal('https://github.com/multica-ai/multica')}
              >
                查看 multica 源码
              </Button>
              <Button>继续搭建界面</Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-4 inline-flex rounded-md border border-border bg-muted p-2 text-muted-foreground">
                <card.icon className="size-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <article className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">当前阶段目标</h3>
                <p className="text-xs text-muted-foreground">先对齐 multica 的主界面层级，不急着补全业务深度。</p>
              </div>
              <Button variant="ghost" size="sm">查看文档</Button>
            </div>

            <div className="mt-4 space-y-2">
              {[
                '共享 sidebar 壳组件已经进入 @demo/ui。',
                '共享 dashboard layout / page header 已进入 @demo/views。',
                '平台能力依然通过 @demo/core 注入，不回退到平台直调。',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2"
                >
                  <span className="mt-1 size-1.5 rounded-full bg-foreground/50" />
                  <p className="text-sm text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">接下来会补什么</h3>
              <p className="text-xs text-muted-foreground">按照 multica 的信息架构，逐步把壳层变成更真实的工作台。</p>
            </div>

            <div className="mt-4 space-y-3">
              {[
                ['顶部筛选/显示控制区', '对齐 issues header 的信息密度和控件层级。'],
                ['多页面导航', '把事项、项目、设置等页骨架从共享包挂起来。'],
                ['主题与细节状态', '继续补暗色模式、激活态和移动端侧栏行为。'],
              ].map(([title, description]) => (
                <div key={title} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}
