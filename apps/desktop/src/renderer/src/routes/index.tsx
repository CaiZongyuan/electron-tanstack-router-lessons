import { createFileRoute } from '@tanstack/react-router'
import { HomeView } from '@demo/views/home/home-view'

export const Route = createFileRoute('/')({
  component: HomeView,
})
