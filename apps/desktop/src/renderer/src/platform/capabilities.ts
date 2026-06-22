import type { PlatformCapabilities } from '@demo/core/platform/types'

export const desktopPlatformCapabilities: PlatformCapabilities = {
  async openExternal(url) {
    await window.desktopAPI.openExternal(url)
  },
}
