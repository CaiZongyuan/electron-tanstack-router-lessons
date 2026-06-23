import './styles.css'

import { createRoot } from 'react-dom/client'
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// 液态玻璃风格默认深色（见 docs/frontend/08）。
document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
