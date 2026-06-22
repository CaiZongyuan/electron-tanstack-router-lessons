import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import type { PlatformCapabilities } from './types'

const PlatformCapabilitiesContext =
  createContext<PlatformCapabilities | null>(null)

export function PlatformCapabilitiesProvider({
  capabilities,
  children,
}: PropsWithChildren<{ capabilities: PlatformCapabilities }>) {
  return (
    <PlatformCapabilitiesContext.Provider value={capabilities}>
      {children}
    </PlatformCapabilitiesContext.Provider>
  )
}

export function usePlatformCapabilities() {
  const capabilities = useContext(PlatformCapabilitiesContext)

  if (!capabilities) {
    throw new Error('PlatformCapabilitiesProvider 缺失，无法调用平台能力。')
  }

  return capabilities
}
