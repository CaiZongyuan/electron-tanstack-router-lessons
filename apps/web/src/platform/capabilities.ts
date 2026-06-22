import type { PlatformCapabilities } from '@demo/core/platform/types'

export const webPlatformCapabilities: PlatformCapabilities = {
  openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}
