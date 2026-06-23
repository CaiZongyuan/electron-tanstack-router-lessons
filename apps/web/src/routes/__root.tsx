import { createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { PlatformCapabilitiesProvider } from '@demo/core/platform/context'
import { DaemonClientProvider } from '@demo/core/daemon/client-context'
import { AppLayout } from '@demo/views/layout/app-layout'
import { webPlatformCapabilities } from '../platform/capabilities'
import { webDaemonClient } from '../platform/daemon-client'

import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <PlatformCapabilitiesProvider capabilities={webPlatformCapabilities}>
      <DaemonClientProvider client={webDaemonClient}>
        <AppLayout />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      </DaemonClientProvider>
    </PlatformCapabilitiesProvider>
  )
}
