/**
 * Market installer core tests: path allowlist, download plan building, and
 * the atomic install flow (success, conflict, download failure cleanup).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MARKET_ORIGIN,
  MarketInstallError,
  installAsset,
  isSafeRel,
  planDownload,
  targetDir,
} from './installer.ts'

let dirs: string[] = []

function tmpHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-market-test-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

describe('isSafeRel', () => {
  it('accepts normal asset-relative paths', () => {
    expect(isSafeRel('skin.css')).toBe(true)
    expect(isSafeRel('assets/whale-art.webp')).toBe(true)
    expect(isSafeRel('preview/light.jpg')).toBe(true)
    expect(isSafeRel('a.b.c/x_y-z/001.gif')).toBe(true)
  })

  it('rejects traversal, absolute and empty-relative paths', () => {
    expect(isSafeRel('../evil')).toBe(false)
    expect(isSafeRel('a/../../b')).toBe(false)
    expect(isSafeRel('/absolute')).toBe(false)
    expect(isSafeRel('a//b')).toBe(false)
    expect(isSafeRel('a/')).toBe(false)
    expect(isSafeRel('')).toBe(false)
    expect(isSafeRel('a b.png')).toBe(false)
  })
})

describe('planDownload', () => {
  it('builds validated absolute URLs from manifest rels', () => {
    const plan = planDownload('skin', 'whale-song', ['skin.json', 'assets/whale-art.webp'])
    expect(plan).toEqual([
      { rel: 'skin.json', url: MARKET_ORIGIN + '/assets/skins/whale-song/skin.json' },
      { rel: 'assets/whale-art.webp', url: MARKET_ORIGIN + '/assets/skins/whale-song/assets/whale-art.webp' },
    ])
  })

  it('rejects unsafe rels and duplicates', () => {
    expect(() => planDownload('skin', 'whale-song', ['../x'])).toThrow(/unsafe manifest path/)
    expect(() => planDownload('skin', 'whale-song', ['a', 'a'])).toThrow(/duplicate manifest path/)
    expect(() => planDownload('pet', 'bad/id', ['pet.json'])).toThrow(/invalid asset id/)
    expect(() => planDownload('skin', 'whale-song', [])).toThrow(/declares no files/)
  })
})

describe('installAsset', () => {
  const manifest = {
    skins: {
      items: [
        {
          id: 'whale-song',
          files: ['skin.json', 'skin.css', 'assets/whale-art.webp'],
        },
      ],
    },
    pets: {
      items: [
        {
          id: 'whale-girl',
          files: ['pet.json', 'spritesheet.webp'],
        },
      ],
    },
  }

  function mockFetch(overrides: Record<string, number> = {}): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const m = url.match(/\/manifest\/(skins|pets)\.json$/)
      if (m) {
        return new Response(JSON.stringify(manifest[m[1] as 'skins' | 'pets']), { status: 200 })
      }
      const file = url.split('/').pop() ?? ''
      if (overrides[file] !== undefined) {
        return new Response('nope', { status: overrides[file] })
      }
      return new Response('data-' + file, { status: 200 })
    }) as typeof fetch
  }

  it('installs a skin into $DSH_HOME/skins/<id> atomically', async () => {
    const home = tmpHome()
    const result = await installAsset('skin', 'whale-song', { dshHome: home, fetchImpl: mockFetch() })
    expect(result.ok).toBe(true)
    expect(result.files).toBe(3)
    expect(result.dest).toBe(targetDir(home, 'skin', 'whale-song'))
    expect(readFileSync(join(home, 'skins', 'whale-song', 'skin.json'), 'utf8')).toBe('data-skin.json')
    expect(readFileSync(join(home, 'skins', 'whale-song', 'assets', 'whale-art.webp'), 'utf8')).toBe('data-whale-art.webp')
  })

  it('refuses to overwrite without force and replaces with force', async () => {
    const home = tmpHome()
    const dest = targetDir(home, 'pet', 'whale-girl')
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, 'old.txt'), 'old')
    await expect(installAsset('pet', 'whale-girl', { dshHome: home, fetchImpl: mockFetch() }))
      .rejects.toMatchObject({ code: 'conflict' })
    await installAsset('pet', 'whale-girl', { dshHome: home, fetchImpl: mockFetch(), force: true })
    expect(existsSync(join(dest, 'old.txt'))).toBe(false)
    expect(readFileSync(join(dest, 'pet.json'), 'utf8')).toBe('data-pet.json')
  })

  it('cleans the temp dir and keeps nothing partial on download failure', async () => {
    const home = tmpHome()
    await expect(
      installAsset('skin', 'whale-song', { dshHome: home, fetchImpl: mockFetch({ 'whale-art.webp': 404 }) }),
    ).rejects.toMatchObject({ code: 'download' })
    const dest = targetDir(home, 'skin', 'whale-song')
    expect(existsSync(dest)).toBe(false)
    const leftovers = dirs.map((d) => {
      try {
        return require('node:fs').readdirSync(join(home, 'skins')).filter((n: string) => n.startsWith('whale-song'))
      } catch { return [] }
    }).flat()
    expect(leftovers).toEqual([])
  })

  it('rejects unknown ids with manifest error', async () => {
    const home = tmpHome()
    await expect(installAsset('skin', 'nope', { dshHome: home, fetchImpl: mockFetch() }))
      .rejects.toMatchObject({ code: 'manifest' })
  })

  it('exposes MarketInstallError with typed code', () => {
    const err = new MarketInstallError('conflict', 'x')
    expect(err.code).toBe('conflict')
  })
})
