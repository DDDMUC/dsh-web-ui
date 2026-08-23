/**
 * macOS wallpaper discovery tests: an in-memory filesystem stands in for
 * ~/Library/Application Support/com.apple.wallpaper and Desktop Pictures,
 * covering the modern aerial layout, the legacy idleassetsd layout,
 * manifest title mapping and fallback, thumbnail pairing, Desktop Pictures
 * heic listing, de-duplication and the non-darwin early-out.
 */
import { describe, expect, it } from 'vitest'
import {
  readAerialManifest,
  scanMacAerials,
  scanMacDesktopPictures,
  scanMacosWallpapers,
  defaultMacosWallpaperRoots,
  type MacosScanFs,
} from '../src/macos-library.ts'

interface FakeNode {
  kind: 'file' | 'dir'
  content?: string
  children?: string[]
  mtimeMs?: number
  size?: number
}

/** Build an injectable fs face over a path -> node map. */
function fakeFs(tree: Record<string, FakeNode>): MacosScanFs {
  return {
    exists: (path) => path in tree,
    readdir: (path) => {
      const node = tree[path]
      if (node === undefined || node.kind !== 'dir') throw new Error('ENOTDIR: ' + path)
      return node.children ?? []
    },
    readFile: (path) => {
      const node = tree[path]
      if (node === undefined || node.kind !== 'file') throw new Error('ENOENT: ' + path)
      return node.content ?? ''
    },
    stat: (path) => {
      const node = tree[path]
      if (node === undefined) throw new Error('ENOENT: ' + path)
      return {
        mtimeMs: node.mtimeMs ?? 1000,
        size: node.size ?? (node.content?.length ?? 0),
        isFile: () => node.kind === 'file',
        isDirectory: () => node.kind === 'dir',
      }
    },
  }
}

const dir = (children: string[]): FakeNode => ({ kind: 'dir', children })
const file = (content: string, extra: Partial<FakeNode> = {}): FakeNode => ({ kind: 'file', content, ...extra })

const MANIFEST = JSON.stringify({
  assets: [
    { id: 'AAAA-1', accessibilityLabel: 'Sonoma from Above' },
    { id: 'BBBB-2', accessibilityLabel: 'Patagonia' },
    { id: 'CCCC-3' }, // no label: falls back to the stem
  ],
})

describe('readAerialManifest', () => {
  it('maps asset ids to their accessibility labels', () => {
    const titles = readAerialManifest(MANIFEST)
    expect(titles.get('AAAA-1')).toBe('Sonoma from Above')
    expect(titles.get('BBBB-2')).toBe('Patagonia')
  })

  it('returns an empty map for malformed manifests', () => {
    expect(readAerialManifest('not json').size).toBe(0)
    expect(readAerialManifest('{"assets": 42}').size).toBe(0)
    expect(readAerialManifest('[]').size).toBe(0)
  })
})

describe('scanMacAerials', () => {
  it('scans the modern per-user layout with titles and thumbnails', () => {
    const root = '/home/u/Library/Application Support/com.apple.wallpaper/aerials'
    const fs = fakeFs({
      [root]: dir(['videos', 'thumbnails', 'manifest']),
      [root + '/videos']: dir(['AAAA-1.mov', 'BBBB-2.mov', 'README.txt']),
      [root + '/videos/AAAA-1.mov']: file('VID1', { mtimeMs: 42, size: 7 }),
      [root + '/videos/BBBB-2.mov']: file('VID2'),
      [root + '/thumbnails']: dir(['AAAA-1.png']),
      [root + '/thumbnails/AAAA-1.png']: file('PNG'),
      [root + '/manifest']: dir(['entries.json']),
      [root + '/manifest/entries.json']: file(MANIFEST),
    })
    const entries = scanMacAerials([root], fs)
    expect(entries.map((e) => e.id).sort()).toEqual(['macos-aerial/AAAA-1', 'macos-aerial/BBBB-2'])
    const a = entries.find((e) => e.id === 'macos-aerial/AAAA-1')
    expect(a?.title).toBe('Sonoma from Above')
    expect(a?.type).toBe('video')
    expect(a?.source).toBe('system')
    expect(a?.playable).toBe(true)
    expect(a?.previewAbs).toBe(root + '/thumbnails/AAAA-1.png')
    expect(a?.srcMtime).toBe(42)
    // No thumbnail downloaded for BBBB-2: the preview stays null and the
    // panel falls back to the video first frame.
    const b = entries.find((e) => e.id === 'macos-aerial/BBBB-2')
    expect(b?.title).toBe('Patagonia')
    expect(b?.previewAbs).toBeNull()
  })

  it('scans the legacy idleassetsd quality-folder layout', () => {
    const root = '/Library/Application Support/com.apple.idleassetsd/Customer'
    const fs = fakeFs({
      [root]: dir(['4KSDR240FPS', 'TVIdleScreenStrings.bundle', 'entries.json']),
      [root + '/4KSDR240FPS']: dir(['EEEE-5.mov']),
      [root + '/4KSDR240FPS/EEEE-5.mov']: file('VID'),
      [root + '/TVIdleScreenStrings.bundle']: dir(['en.lproj']),
      [root + '/entries.json']: file(MANIFEST),
    })
    const entries = scanMacAerials([root], fs)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe('macos-aerial/EEEE-5')
    // Not in the manifest: the asset id is the title.
    expect(entries[0]?.title).toBe('EEEE-5')
    expect(entries[0]?.previewAbs).toBeNull()
  })

  it('de-dupes asset ids across roots (first root wins)', () => {
    const modern = '/m'
    const legacy = '/l'
    const fs = fakeFs({
      [modern + '/videos']: dir(['AAAA-1.mov']),
      [modern + '/videos/AAAA-1.mov']: file('V1'),
      [legacy]: dir(['2KSDR']),
      [legacy + '/2KSDR']: dir(['AAAA-1.mov']),
      [legacy + '/2KSDR/AAAA-1.mov']: file('V2'),
    })
    const entries = scanMacAerials([modern, legacy], fs)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.fileAbs).toBe(modern + '/videos/AAAA-1.mov')
  })

  it('returns nothing when roots are absent', () => {
    expect(scanMacAerials(['/nope'], fakeFs({}))).toEqual([])
  })
})

describe('scanMacDesktopPictures', () => {
  it('lists heic wallpapers, skips madesktop records and de-dupes by stem', () => {
    const system = '/System/Library/Desktop Pictures'
    const legacy = '/Library/Desktop Pictures'
    const fs = fakeFs({
      [system]: dir(['Tahoe Day.heic', 'iMac Blue.heic', 'Big Sur Aerial.madesktop']),
      [system + '/Tahoe Day.heic']: file('HEIC1', { mtimeMs: 7, size: 99 }),
      [system + '/iMac Blue.heic']: file('HEIC2'),
      [legacy]: dir(['Tahoe Day.heic', 'My Download.heic']),
      [legacy + '/Tahoe Day.heic']: file('DUP'),
      [legacy + '/My Download.heic']: file('HEIC3'),
    })
    const entries = scanMacDesktopPictures([system, legacy], fs)
    expect(entries.map((e) => e.id).sort()).toEqual([
      'macos-heic/My Download',
      'macos-heic/Tahoe Day',
      'macos-heic/iMac Blue',
    ])
    const tahoe = entries.find((e) => e.id === 'macos-heic/Tahoe Day')
    expect(tahoe?.type).toBe('image')
    expect(tahoe?.source).toBe('system')
    expect(tahoe?.playable).toBe(false)
    expect(tahoe?.previewAbs).toBeNull()
    expect(tahoe?.fileAbs).toBe(system + '/Tahoe Day.heic')
    expect(tahoe?.srcSize).toBe(99)
  })
})

describe('scanMacosWallpapers', () => {
  const roots = defaultMacosWallpaperRoots('/home/u')

  it('scans nothing off darwin', () => {
    const fs = fakeFs({})
    expect(scanMacosWallpapers(roots, { ...fs, platform: 'linux' })).toEqual([])
    expect(scanMacosWallpapers(roots, { ...fs, platform: 'win32' })).toEqual([])
  })

  it('combines aerials and desktop pictures on darwin', () => {
    const aerialRoot = roots.aerials[0]!
    const pictureRoot = roots.pictures[0]!
    const fs = fakeFs({
      [aerialRoot + '/videos']: dir(['AAAA-1.mov']),
      [aerialRoot + '/videos/AAAA-1.mov']: file('V'),
      [pictureRoot]: dir(['Tahoe Day.heic']),
      [pictureRoot + '/Tahoe Day.heic']: file('H'),
    })
    const entries = scanMacosWallpapers(roots, { ...fs, platform: 'darwin' })
    expect(entries.map((e) => e.type).sort()).toEqual(['image', 'video'])
  })

  it('exposes the default root layout', () => {
    expect(roots.aerials[0]).toBe('/home/u/Library/Application Support/com.apple.wallpaper/aerials')
    expect(roots.pictures).toContain('/System/Library/Desktop Pictures')
  })
})
