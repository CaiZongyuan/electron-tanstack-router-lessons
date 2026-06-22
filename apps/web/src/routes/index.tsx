import { createFileRoute } from '@tanstack/react-router'
import { HomeView } from '@demo/views/home/home-view'

// 薄路由文件：路由树是 app 专属（由 @tanstack/router-plugin 生成），
// 但渲染的视图组件来自共享包 @demo/views——页面逻辑两端共用，路由定义各端自有。
export const Route = createFileRoute('/')({ component: HomeView })
