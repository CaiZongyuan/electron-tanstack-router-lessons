import { createFileRoute } from '@tanstack/react-router'
import { ChatView } from '@demo/views/daemon/chat-view'

export const Route = createFileRoute('/daemon')({
  component: ChatView,
})
