/**
 * Host filesystem service for the panel: directory listing, file read with a
 * preview ceiling, text write with an mtime conflict check, filename search
 * with directory pruning, delete (untracked discard), and a recursive watcher
 * that emits change events. Every operation resolves against a gated project
 * root and refuses to escape it (path traversal guard). Text is decoded utf-8;
 * images come back as data URLs (capped) so the browser renders them without
 * extra round trips.
 * @module dsh-aionui-panel/host/fs-service
 */

import { readdir, readFile, stat, writeFile, rm, mkdir } from 'node:fs/promises'
import { watch as watchDir, type Dirent, type FSWatcher } from 'node:fs'
import { join, dirname } from 'node:path'
import type { DirListing, FileRead, FsEntry, PanelError, SearchHit, SearchView } from '../core/types.ts'
import { isPathInside, type WorkspaceGate } from './gate.ts'

/** Preview text ceiling — mirrors AionUi's single-tab 80k-char cap. */
export const TEXT_CAP_CHARS = 80_000
/** Image read cap (data URL payload budget). */
const IMAGE_CAP_BYTES = 8 << 20
/** Filename-search caps (results and scanned entries). */
const SEARCH_HIT_CAP = 200
const SEARCH_SCAN_CAP = 20_000
/** Directories skipped by search (VS Code-like noise reduction). */
const SEARCH_SKIP_DIRS = new Set(['.git', 'node_modules'])
/** Directories never listed in the tree. */
const TREE_SKIP_DIRS = new Set(['.git'])
/** Polling fallback interval when recursive watch is unavailable. */
const POLL_FALLBACK_MS = 3_000

/** Resolve a relative path against the root and reject any escape. */
function resolveInside(root: string, rel: string): { ok: true; abs: string } | { ok: false; error: PanelError } {
  if (rel.includes('\0')) return { ok: false, error: { code: 'path-outside-root', message: 'invalid path' } }
  const abs = join(root, rel)
  if (!isPathInside(root, abs)) {
    return { ok: false, error: { code: 'path-outside-root', message: `path escapes root: ${rel}` } }
  }
  return { ok: true, abs }
}

/** Case-insensitive alpha compare (dirs first, then files). */
function compareEntries(a: FsEntry, b: FsEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  const an = a.name.toLowerCase()
  const bn = b.name.toLowerCase()
  return an < bn ? -1 : an > bn ? 1 : 0
}

/** The image probe: parse PNG/JPEG/GIF/WebP header dimensions (undefined on failure). */
export function probeImageSize(data: Buffer): { width: number; height: number } | undefined {
  try {
    if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    }
    if (data.length >= 10 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return { width: data.readUInt16BE(6), height: data.readUInt16BE(4) }
    }
    if (data.length >= 14 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
    }
    if (
      data.length >= 30 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
      && data[12] === 0x56 && data[13] === 0x50 && data[14] === 0x38 && data[15] === 0x58
    ) {
      const size = (o: number): number => data[o] | (data[o + 1] << 8) | (data[o + 2] << 16)
      return { width: size(24) + 1, height: size(27) + 1 }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Derive the mime type for an image read from the extension, then the content. */
function imageMime(rel: string, data: Buffer): string {
  const ext = rel.split('.').pop()?.toLowerCase() ?? ''
  const byExt: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif', bmp: 'image/bmp',
  }
  if (byExt[ext]) return byExt[ext]
  if (data.length >= 3 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  return 'application/octet-stream'
}

/**
 * Filesystem service: gated listing/read/write/search/delete plus a change
 * watcher. All relative paths are resolved against the gated root.
 * @param gate - the workspace gate (host: registered workspace membership).
 */
export class FsService {
  constructor(private readonly gate: WorkspaceGate) {}

  /** List one directory (relative path; '' = root). Sorted dirs-first alpha. */
  async list(root: string, rel: string): Promise<DirListing | PanelError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const resolved = resolveInside(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    let dirents: Dirent[]
    try {
      dirents = await readdir(resolved.abs, { withFileTypes: true })
    } catch {
      return { code: 'not-found', message: `cannot list ${rel}` }
    }
    const out: FsEntry[] = []
    for (const entry of dirents) {
      if (entry.isDirectory() && TREE_SKIP_DIRS.has(entry.name)) continue
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        out.push({ name: entry.name, path, isDir: true, size: 0, mtime: 0 })
        continue
      }
      let size = 0
      let mtime = 0
      try {
        const info = await stat(join(resolved.abs, entry.name))
        size = info.size
        mtime = info.mtimeMs
      } catch {
        // Entry vanished mid-list; keep a size-0 row rather than dropping it.
      }
      out.push({ name: entry.name, path, isDir: false, size, mtime })
    }
    out.sort(compareEntries)
    return { root: gated.canonical, entries: out }
  }

  /** Read one file for preview: text decoded utf-8 (capped), images as data URLs. */
  async read(root: string, rel: string, asImage: boolean): Promise<FileRead | PanelError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const resolved = resolveInside(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    let data: Buffer
    let info: Awaited<ReturnType<typeof stat>>
    try {
      data = await readFile(resolved.abs)
      info = await stat(resolved.abs)
    } catch {
      return { code: 'not-found', message: `cannot read ${rel}` }
    }
    if (info.isDirectory()) return { code: 'is-directory', message: `${rel} is a directory` }
    if (asImage) {
      if (data.length > IMAGE_CAP_BYTES) {
        return { code: 'read-failed', message: 'image exceeds preview cap' }
      }
      const mime = imageMime(rel, data)
      return {
        content: `data:${mime};base64,${data.toString('base64')}`,
        truncated: false,
        size: data.length,
        mtime: info.mtimeMs,
        image: probeImageSize(data),
      }
    }
    const text = data.toString('utf8')
    const truncated = text.length > TEXT_CAP_CHARS
    return {
      content: truncated ? text.slice(0, TEXT_CAP_CHARS) : text,
      truncated,
      size: data.length,
      mtime: info.mtimeMs,
    }
  }

  /** Write text content back, refusing when the file moved on disk (mtime conflict). */
  async write(
    root: string,
    rel: string,
    content: string,
    baseMtime?: number,
  ): Promise<{ mtime: number } | PanelError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const resolved = resolveInside(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    try {
      let current: Awaited<ReturnType<typeof stat>>
      try {
        current = await stat(resolved.abs)
      } catch {
        current = { mtimeMs: 0 } as Awaited<ReturnType<typeof stat>>
      }
      if (baseMtime !== undefined && Number(current.mtimeMs) !== 0 && Math.abs(Number(current.mtimeMs) - baseMtime) > 1) {
        return { code: 'write-conflict', message: 'file changed on disk since it was loaded' }
      }
      await mkdir(dirname(resolved.abs), { recursive: true })
      await writeFile(resolved.abs, content, 'utf8')
      const info = await stat(resolved.abs)
      return { mtime: info.mtimeMs }
    } catch {
      return { code: 'write-failed', message: `cannot write ${rel}` }
    }
  }

  /** Recursive filename search (case-insensitive substring), pruned at noise dirs. */
  async search(root: string, query: string): Promise<SearchView | PanelError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const needle = query.trim().toLowerCase()
    if (needle === '') return { query, hits: [], truncated: false }
    const hits: SearchHit[] = []
    let scanned = 0
    let truncated = false
    const walk = async (rel: string, depth: number): Promise<void> => {
      if (truncated) return
      const resolved = resolveInside(gated.canonical, rel)
      if (!resolved.ok) return
      let dirents: Dirent[]
      try {
        dirents = await readdir(resolved.abs, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of dirents) {
        if (scanned >= SEARCH_SCAN_CAP) {
          truncated = true
          return
        }
        scanned += 1
        const path = rel === '' ? entry.name : `${rel}/${entry.name}`
        if (entry.isDirectory()) {
          if (SEARCH_SKIP_DIRS.has(entry.name)) continue
          if (depth < 24 && !truncated) await walk(path, depth + 1)
          continue
        }
        if (entry.name.toLowerCase().includes(needle)) {
          if (hits.length >= SEARCH_HIT_CAP) {
            truncated = true
            return
          }
          hits.push({ path, name: entry.name, isDir: false })
        }
      }
    }
    try {
      await walk('', 0)
    } catch {
      return { code: 'search-failed', message: 'search walk failed' }
    }
    // Rank: exact matches first, then prefix, then substring; shorter paths first.
    const rank = (hit: SearchHit): number => {
      const name = hit.name.toLowerCase()
      if (name === needle) return 0
      if (name.startsWith(needle)) return 1
      return 2
    }
    hits.sort((a, b) => rank(a) - rank(b) || a.path.length - b.path.length || (a.path < b.path ? -1 : 1))
    return { query, hits, truncated }
  }

  /** Delete a path (discard of untracked files). Recursive for directories. */
  async delete(root: string, rel: string): Promise<{ ok: true } | PanelError> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated.error
    const resolved = resolveInside(gated.canonical, rel)
    if (!resolved.ok) return resolved.error
    if (rel === '') return { code: 'path-outside-root', message: 'refusing to delete the root' }
    try {
      await rm(resolved.abs, { recursive: true, force: true })
      return { ok: true }
    } catch {
      return { code: 'write-failed', message: `cannot delete ${rel}` }
    }
  }

  /**
   * Watch a root recursively and emit change events (debounced + batched).
   * Recursive watch may be unavailable; a polling fallback then compares the
   * root signature periodically (best-effort).
   * @param root - project root to watch (gated on connect).
   * @param onChange - fired (debounced) when anything under root changed.
   * @returns disposer.
   */
  watch(root: string, onChange: () => void): () => void {
    let disposed = false
    let timer: NodeJS.Timeout | undefined
    let watcher: FSWatcher | undefined
    const fire = (): void => {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        if (!disposed) onChange()
      }, 150)
    }
    let lastSignature = ''
    const poll = (): void => {
      void this.signature(root).then((signature) => {
        if (signature === null || signature === lastSignature) return
        lastSignature = signature
        fire()
      })
    }
    void this.gate(root).then((gated) => {
      if (!gated.ok || disposed) return
      try {
        watcher = watchDir(gated.canonical, { recursive: true }, () => fire())
        watcher.on('error', () => { /* watcher degraded; the poll fallback covers it */ })
      } catch {
        watcher = undefined
        poll()
      }
    })
    const pollTimer = setInterval(poll, POLL_FALLBACK_MS)
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      clearInterval(pollTimer)
      watcher?.close()
    }
  }

  /** Cheap root signature: entries of the root with sizes/mtimes (poll fallback). */
  private async signature(root: string): Promise<string | null> {
    const gated = await this.gate(root)
    if (!gated.ok) return null
    try {
      const entries: Dirent[] = await readdir(gated.canonical, { withFileTypes: true })
      const parts: string[] = []
      for (const entry of entries.slice(0, 200)) {
        let extra = ''
        if (!entry.isDirectory()) {
          try {
            const info = await stat(join(gated.canonical, entry.name))
            extra = `${info.size}:${Math.round(info.mtimeMs / 1000)}`
          } catch {
            extra = 'gone'
          }
        }
        parts.push(`${entry.name}${entry.isDirectory() ? '/' : ''}${extra}`)
      }
      return parts.join('|')
    } catch {
      return null
    }
  }
}
