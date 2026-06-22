import { createRootRoute } from '@tanstack/react-router'
import { PlatformCapabilitiesProvider } from '@demo/core/platform/context'
import { AppLayout } from '@demo/views/layout/app-layout'
import { desktopPlatformCapabilities } from '@renderer/platform/capabilities'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <PlatformCapabilitiesProvider capabilities={desktopPlatformCapabilities}>
      <AppLayout />
    </PlatformCapabilitiesProvider>
  )
}
