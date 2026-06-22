export interface PlatformCapabilities {
  openExternal(url: string): Promise<void> | void
}
