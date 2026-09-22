/**
 * Host half of the dsh-web-settings group. Mounts the settings bridge: a
 * loopback-default HTTP pair that serves the family plugins' settings
 * namespaces through the Host settings surface (ctx.settings, the
 * SettingsForms service), gated by the user's web_settings_namespaces
 * allowlist from settings.yaml (with the built-in family fallback list). An
 * explicit authenticated-proxy config may admit exact same-origin Hosts
 * without changing the default. Each view reports the profile entry id that
 * owns the namespace so the browser half can bind the native
 * ctx.configForms form; the bridge HTTP transport is the fallback.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { resolveDshHome } from './dsh-home.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type { BridgeProfileEntry } from './bridge.ts'
import { makeBridgeRoutes } from './bridge.ts'
import { mountOnce } from './mount-once.ts'

/** Default environment variable holding the reverse-proxy shared token. */
export const DEFAULT_PROXY_TOKEN_ENV = 'DSH_WEB_UI_SETTINGS_PROXY_TOKEN'

/** Host-side compatibility bridge config. */
export interface Config {
  /** Canonical Host authorities admitted only from the local authenticated proxy. */
  trustedProxyHosts?: string[]
  /** Environment variable whose non-empty value the proxy injects upstream. */
  proxyTokenEnv?: string
}

export const Config: z<Config> = z.object({
  trustedProxyHosts: z.array(String).default([]),
  proxyTokenEnv: z.string().min(1).default(DEFAULT_PROXY_TOKEN_ENV),
})

/** Resolve the opt-in proxy token without putting its value in plugin config. */
export function resolveProxyAccess(config?: Config, env: NodeJS.ProcessEnv = process.env): { trustedProxyHosts: string[]; proxyToken?: string } {
  const trustedProxyHosts = config?.trustedProxyHosts ?? []
  if (trustedProxyHosts.length === 0) return { trustedProxyHosts }
  const proxyTokenEnv = config?.proxyTokenEnv ?? DEFAULT_PROXY_TOKEN_ENV
  if (proxyTokenEnv.trim() === '') throw new Error('web-ui-settings: proxyTokenEnv must not be empty')
  const proxyToken = env[proxyTokenEnv]
  if (proxyToken === undefined || proxyToken === '') {
    throw new Error('web-ui-settings: trustedProxyHosts requires a non-empty ' + proxyTokenEnv + ' environment variable')
  }
  return { trustedProxyHosts, proxyToken }
}

/** Required services before the bridge routes can mount. */
export const inject = ['webServer'] as const

/**
 * Resolve the settings YAML fallback path when the host settings surface does
 * not report a usable settings document: $DSH_HOME/settings.yaml (defaulting
 * to ~/.dsh/settings.yaml). Test seam: env and home are injectable.
 */
export function settingsYamlFallbackPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  return join(resolveDshHome(env, home), 'settings.yaml')
}

/**
 * Path of the settings document the Host imported on first boot and then
 * renamed: the settings surface moves `$DSH_HOME/settings.yaml` into its
 * profile configuration once, so the renamed file is where a pre-0.1.7
 * `web_settings_namespaces` block survives longest.
 * @param env - process environment to read DSH_HOME from (test seam).
 * @param home - platform home directory fallback (test seam).
 * @returns the absolute path of the imported settings document.
 */
export function importedSettingsYamlPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  return join(resolveDshHome(env, home), 'settings.yaml.imported')
}

/** Whether one Host-reported path names a settings YAML document. */
export function isSettingsDocumentPath(path: string): boolean {
  const name = basename(path)
  return name === 'settings.yaml' || name === 'settings.yaml.imported'
}

/**
 * Candidate raw settings documents, most authoritative first: the renamed
 * import, then the legacy document path, then — only when it really is a
 * settings document — the path the Host reports through
 * `settings.documentPath`. On 0.1.7 that path is the PROFILE PATCH the native
 * configuration editor edits, so it is checked rather than trusted.
 * @param hostDocumentPath - `ctx.settings.documentPath`, when readable.
 * @param env - process environment to read DSH_HOME from (test seam).
 * @param home - platform home directory fallback (test seam).
 * @returns the candidate paths in read order.
 */
export function settingsYamlCandidatePaths(hostDocumentPath?: string, env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  const candidates = [importedSettingsYamlPath(env, home), settingsYamlFallbackPath(env, home)]
  if (hostDocumentPath !== undefined && hostDocumentPath !== '' && isSettingsDocumentPath(hostDocumentPath) && !candidates.includes(hostDocumentPath)) {
    candidates.push(hostDocumentPath)
  }
  return candidates
}

/**
 * Read the first readable candidate document.
 * @param candidates - candidate paths in read order.
 * @returns the document text, or '' when none of them is readable.
 */
export function readSettingsYamlDocument(candidates: readonly string[]): string {
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      // Unreadable or absent: the next candidate is more likely to exist.
    }
  }
  return ''
}

/**
 * Read the Host profile entries the bridge resolves settings namespaces from.
 * The config editor is optional: a Host that serves no editor still serves
 * settings, so the bridge degrades to namespace-only views instead of failing.
 * @param ctx - a context carrying service lookup.
 * @returns the profile entries, or the empty list when the editor is absent.
 */
export function readProfileEntries(ctx: { get(name: string): unknown }): BridgeProfileEntry[] {
  let editor: unknown
  try {
    editor = ctx.get('configEditor')
  } catch {
    return []
  }
  if (typeof editor !== 'object' || editor === null) return []
  const entries = (editor as { entries?: unknown }).entries
  if (typeof entries !== 'function') return []
  let rows: unknown
  try {
    rows = (entries as () => unknown).call(editor)
  } catch {
    return []
  }
  return Array.isArray(rows) ? rows as BridgeProfileEntry[] : []
}

/**
 * Mount the settings bridge when a settings surface exists (it is what the
 * bridge serves, so without one there is nothing to expose).
 * @param ctx - host plugin context.
 * @param config - loopback-default bridge and authenticated-proxy config.
 */
export const apply = mountOnce('@linxin666/dsh-client-ui-web-ui-settings', applyImpl)

function applyImpl(ctx: Context, config?: Config): void {
  const access = resolveProxyAccess(config)
  ctx.inject(['settings'], (sctx) => {
    // `documentPath` is the profile patch on 0.1.7 and a settings document on
    // older hosts, so it joins the candidates only once it is checked.
    let documentPath: string | undefined
    try {
      documentPath = sctx.settings.documentPath
    } catch {
      documentPath = undefined
    }
    const candidates = settingsYamlCandidatePaths(documentPath)
    sctx.effect(() => {
      const disposers = makeBridgeRoutes({
        settings: sctx.settings,
        readSettingsYaml: () => readSettingsYamlDocument(candidates),
        entries: () => readProfileEntries(sctx),
      }, access).map(route => sctx.webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'web-ui-settings: settings bridge')
  })
}
