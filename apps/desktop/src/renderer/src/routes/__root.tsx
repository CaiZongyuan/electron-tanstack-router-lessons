import { createRootRoute } from '@tanstack/react-router'
import { PlatformCapabilitiesProvider } from '@demo/core/platform/context'
import { DaemonClientProvider } from '@demo/core/daemon/client-context'
import { AppLayout } from '@demo/views/layout/app-layout'
import { desktopPlatformCapabilities } from '@renderer/platform/capabilities'
import { desktopDaemonClient } from '@renderer/daemon/client'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <PlatformCapabilitiesProvider capabilities={desktopPlatformCapabilities}>
      <DaemonClientProvider client={desktopDaemonClient}>
        <AppLayout />
      </DaemonClientProvider>
    </PlatformCapabilitiesProvider>
  )
}
