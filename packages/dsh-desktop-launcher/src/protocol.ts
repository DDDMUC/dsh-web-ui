/**
 * Wire contract between the host half (routes.ts) and the browser half
 * (client/api.ts). Pure types plus one path constant — imported by both
 * halves, bundled into each, no runtime identity to share.
 */
import type { LauncherPlatform } from './core/launcher.ts'

/** Route family of the desktop-launcher host API. */
export const LAUNCHER_API = {
  /** Create (or refresh) the desktop icon. */
  create: '/api/dsh-desktop-launcher/create',
  /** Request the host process to exit gracefully. */
  shutdown: '/api/dsh-desktop-launcher/shutdown',
  /** Maintain the browser lease of a shortcut-started host process. */
  lifecycle: '/api/dsh-desktop-launcher/lifecycle',
} as const

/** Browser lifecycle operations for a shortcut-managed host process. */
export type LauncherLifecycleAction = 'attach' | 'heartbeat' | 'release'

/** Authenticated browser lease message. */
export interface LauncherLifecycleMessage {
  action: LauncherLifecycleAction
  token: string
  clientId: string
}

/** Result of a desktop-icon creation. */
export interface CreateResult {
  /** True when the icon was written (or refreshed). */
  ok: true
  /** Absolute path of the icon on the Desktop. */
  path: string
  /** Platform the icon was generated for. */
  platform: LauncherPlatform
  /** Non-fatal notice, e.g. dsh missing from PATH. */
  warning?: string
}
