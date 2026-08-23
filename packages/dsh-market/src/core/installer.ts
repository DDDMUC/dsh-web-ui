/**
 * Market asset installer core: builds the download plan from the public
 * dsh-market.com manifest and writes it into the DSH home asset
 * directories ($DSH_HOME/skins/<id>, $DSH_HOME/pets/<id>).
 *
 * Security model (host half):
 *  - the manifest is fetched from MARKET_ORIGIN only;
 *  - every relative path comes from that manifest and is validated against
 *    a conservative allowlist (no '..', no absolute paths, no empty parts);
 *  - the download URL is rebuilt from the validated rel, never taken from
 *    the client (the client only sends the asset id);
 *  - writes are staged in a temp dir next to the destination and renamed
 *    into place only after every file downloaded successfully, so a failed
 *    install never leaves a half-written asset directory;
 *  - an existing directory is replaced only with force (the UI confirms).
 * @module @linxin666/dsh-client-ui-market/core
 */

import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

export const MARKET_ORIGIN = 'https://dsh-market.com'

export type MarketKind = 'skin' | 'pet'

export interface MarketManifestItem {
  id: string
  files?: string[]
  [key: string]: unknown
}

export interface MarketManifest {
  items: MarketManifestItem[]
  [key: string]: unknown
}

export interface DownloadPlanEntry {
  /** Path relative to the asset directory (e.g. assets/whale-art.webp). */
  rel: string
  /** Absolute download URL on the market origin. */
  url: string
}

const SAFE_REL_RE = /^[A-Za-z0-9._][A-Za-z0-9._\-/]{0,199}$/

/** Whether one manifest-relative path passes the conservative allowlist. */
export function isSafeRel(rel: string): boolean {
  if (typeof rel !== 'string' || !SAFE_REL_RE.test(rel)) return false
  if (rel.includes('..') || rel.includes('//') || rel.startsWith('/') || rel.endsWith('/')) return false
  return true
}

/** The market asset base URL for one kind/id (skins/<id>/ or pets/<id>/). */
export function assetBase(kind: MarketKind, id: string): string {
  return `${MARKET_ORIGIN}/assets/${kind === 'skin' ? 'skins' : 'pets'}/${encodeURIComponent(id)}/`
}

/** Build the validated download plan from a manifest file list. */
export function planDownload(kind: MarketKind, id: string, files: readonly string[]): DownloadPlanEntry[] {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw new Error(`invalid asset id: ${id}`)
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`asset ${id} declares no files`)
  }
  const base = assetBase(kind, id)
  const plan: DownloadPlanEntry[] = []
  const seen = new Set<string>()
  for (const rel of files) {
    if (!isSafeRel(rel)) throw new Error(`unsafe manifest path: ${rel}`)
    if (seen.has(rel)) throw new Error(`duplicate manifest path: ${rel}`)
    seen.add(rel)
    plan.push({ rel, url: base + rel.split('/').map(encodeURIComponent).join('/') })
  }
  return plan
}

/** The destination directory for one asset (dsh home + skins|pets + id). */
export function targetDir(dshHome: string, kind: MarketKind, id: string): string {
  return join(dshHome, kind === 'skin' ? 'skins' : 'pets', id)
}

export interface InstallOptions {
  /** Root of the DSH user home ($DSH_HOME or ~/.dsh). */
  dshHome: string
  /** True to replace an existing directory (UI confirms first). */
  force?: boolean
  /** fetch impl (test seam). */
  fetchImpl?: typeof fetch
}

export interface InstallResult {
  ok: true
  kind: MarketKind
  id: string
  files: number
  dest: string
}

export class MarketInstallError extends Error {
  readonly code: 'manifest' | 'download' | 'conflict' | 'write'
  constructor(code: 'manifest' | 'download' | 'conflict' | 'write', message: string) {
    super(message)
    this.code = code
  }
}

async function fetchManifest(kind: MarketKind, fetchImpl: typeof fetch): Promise<MarketManifest> {
  const url = `${MARKET_ORIGIN}/manifest/${kind === 'skin' ? 'skins' : 'pets'}.json`
  const res = await fetchImpl(url)
  if (!res.ok) throw new MarketInstallError('manifest', `manifest fetch failed: ${res.status}`)
  const data = (await res.json()) as MarketManifest
  if (!data || !Array.isArray(data.items)) throw new MarketInstallError('manifest', 'manifest shape invalid')
  return data
}

/**
 * Install one market asset into its DSH home directory (atomic, replace
 * with force). Throws MarketInstallError on any failure; an existing
 * directory is left untouched unless force is true and all files arrived.
 */
export async function installAsset(
  kind: MarketKind,
  id: string,
  options: InstallOptions,
): Promise<InstallResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const manifest = await fetchManifest(kind, fetchImpl)
  const item = manifest.items.find((entry) => entry.id === id)
  if (!item) throw new MarketInstallError('manifest', `asset not in manifest: ${id}`)
  const plan = planDownload(kind, id, item.files ?? [])

  const dest = targetDir(options.dshHome, kind, id)
  let exists = false
  try {
    statSync(dest)
    exists = true
  } catch {
    exists = false
  }
  if (exists && options.force !== true) {
    throw new MarketInstallError('conflict', `destination already exists: ${dest}`)
  }

  const tmp = dest + '.install-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  try {
    mkdirSync(tmp, { recursive: true })
    for (const entry of plan) {
      const res = await fetchImpl(entry.url)
      if (!res.ok) throw new MarketInstallError('download', `${entry.url} failed: ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const target = join(tmp, ...entry.rel.split('/'))
      const guard = entry.rel.split('/').slice(0, -1).join(sep)
      if (guard) mkdirSync(join(tmp, guard), { recursive: true })
      writeFileSync(target, buf)
    }
    if (exists) rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
  } catch (err) {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* best effort */ }
    if (err instanceof MarketInstallError) throw err
    throw new MarketInstallError('write', err instanceof Error ? err.message : String(err))
  }

  return { ok: true, kind, id, files: plan.length, dest }
}
