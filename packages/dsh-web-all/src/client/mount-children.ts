/**
 * Client-side mirror of the host fault-isolation shell (src/shell.ts).
 *
 * The shell folds every family patch row under this package, and the client
 * module scanner only enumerates loader entries — so the folded children's
 * client bundles never reach the browser on their own. This mount runs each
 * generated child client module (src/client/children.generated.ts, inlined
 * into this bundle at build time) as a nested client plugin with its own
 * declared injects on a child fiber: an apply or activation failure degrades
 * that child alone and never fails this bundle's fiber, mirroring the host
 * contract.
 *
 * Double-mount guards: a child whose package id appears in the browser boot
 * payload already mounts through its own loader entry (profile-level direct
 * bundle rows) and is skipped here; the global mount registry shares
 * mountOnce's symbol so two module instances of the same package (npm copy
 * vs repository link) keep one verdict. Registry entries are deliberately
 * never unmarked — inlined children live for the page lifetime, and the
 * loader reloads the page on any plugin change.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { clientChildren } from './children.generated.ts'

const MOUNTED_PLUGINS = Symbol.for('dsh-web.mounted-plugins')

interface BootEntry {
  id?: unknown
  name?: unknown
  disabled?: unknown
}

interface BootPayload {
  entries?: readonly BootEntry[]
}

/** Mapping from real plugin package name to its aggregate patch row id. */
export const CHILD_ROW_IDS: Readonly<Record<string, string>> = {
  '@linxin666/dsh-client-ui-web-ui-settings': 'web-ui-settings',
  '@linxin666/dsh-client-ui-plugin-manager': 'web-ui-plugin-manager',
  '@linxin666/dsh-client-ui-market': 'web-ui-market',
  '@linxin666/dsh-client-ui-task-board': 'web-ui-task-board',
  '@linxin666/dsh-client-ui-git-graph': 'web-ui-git-graph',
  '@linxin666/dsh-remote-web-ui': 'web-ui-remote-web-ui',
  '@linxin666/dsh-pet': 'web-ui-pet',
  '@linxin666/dsh-ssh': 'web-ui-ssh',
  '@linxin666/dsh-tool-describe-image': 'web-ui-tool-describe-image',
  '@linxin666/dsh-client-ui-skill-explorer': 'web-ui-skill-explorer',
  '@linxin666/dsh-doctor': 'web-ui-doctor',
  '@linxin666/dsh-usage': 'web-ui-usage',
  '@linxin666/dsh-session-archive': 'web-ui-session-archive',
  '@linxin666/dsh-client-ui-skin-center': 'web-ui-skin-center',
  '@linxin666/dsh-liangshen': 'web-ui-liangshen',
}

/** Active entry ids and names in the browser boot payload. */
function activeBootEntryIds(): { active: Set<string>; hasBootEntries: boolean } {
  const boot = (globalThis as { __DSH_BOOT__?: BootPayload }).__DSH_BOOT__
  if (boot === undefined || !Array.isArray(boot.entries)) {
    return { active: new Set<string>(), hasBootEntries: false }
  }
  const active = new Set<string>()
  for (const entry of boot.entries) {
    if (entry?.disabled === true) continue
    if (typeof entry?.id === 'string' && entry.id.trim() !== '') active.add(entry.id.trim())
    if (typeof entry?.name === 'string' && entry.name.trim() !== '') active.add(entry.name.trim())
  }
  return { active, hasBootEntries: true }
}

function mountedRegistry(): Set<string> {
  const registry = globalThis as { [MOUNTED_PLUGINS]?: Set<string> }
  registry[MOUNTED_PLUGINS] ??= new Set<string>()
  return registry[MOUNTED_PLUGINS]
}

/** Mount every generated family child that has no client bundle of its own. */
export function mountClientChildren(ctx: ClientContext): void {
  const { active, hasBootEntries } = activeBootEntryIds()
  const registry = mountedRegistry()
  for (const child of clientChildren) {
    if (hasBootEntries) {
      // Direct standalone entry already served by the loader: skip here to avoid double mount
      if (active.has(child.name)) continue

      // Gated aggregate row: if the child belongs to a known family row but that row
      // is disabled or removed from active entries, skip mounting so its UI is hidden.
      const rowId = CHILD_ROW_IDS[child.name]
      if (rowId !== undefined) {
        const subpathName = `@linxin666/dsh-web-all/${rowId.replace(/^web-ui-/, '')}`
        if (!active.has(rowId) && !active.has(subpathName)) {
          continue
        }
      }
    }
    if (registry.has(child.name)) continue
    registry.add(child.name)
    const mod = child.module as { apply?: unknown; default?: unknown; inject?: readonly string[] }
    const face = (mod.default ?? mod) as { apply?: unknown; inject?: readonly string[] }
    const apply = typeof face === 'function' ? face : face.apply
    if (typeof apply !== 'function') {
      console.error(`[dsh-web-all] client child degraded: ${child.name} has no usable apply shape`)
      continue
    }
    const definition = {
      name: child.name,
      inject: face.inject !== undefined ? [...face.inject] : [],
      apply,
    } as Parameters<ClientContext['plugin']>[0]
    try {
      // Sync application errors escape the ctx.plugin() call itself; async
      // ones settle on the returned fiber. Both paths are captured so this
      // bundle's fiber never fails (the boot audit would otherwise tear the
      // family off the page).
      const fiber = ctx.plugin(definition)
      void Promise.resolve(fiber).then(
        () => {},
        (error: unknown) => {
          console.error(`[dsh-web-all] client child degraded: ${child.name}`, error)
        },
      )
    } catch (error) {
      console.error(`[dsh-web-all] client child degraded: ${child.name}`, error)
    }
  }
}
