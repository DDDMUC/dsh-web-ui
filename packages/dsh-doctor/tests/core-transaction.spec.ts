/**
 * Candidate transaction: stage, promote, rollback, abort.
 */
import { describe, expect, it } from 'vitest'
import { createMemoryFs, FsError } from '../src/core/fs.ts'
import { createCandidateTransaction } from '../src/core/transaction.ts'

const HOME = '/h'
const LIVE = HOME + '/profiles/web'

async function seedLive(fs: ReturnType<typeof createMemoryFs>): Promise<void> {
  await fs.mkdir(LIVE, { recursive: true })
  await fs.writeText(LIVE + '/package.json', '{"name":"web"}')
  await fs.writeText(LIVE + '/cordis.patch.yml', `[]
`)
  await fs.mkdir(LIVE + '/node_modules', { recursive: true })
  await fs.writeText(LIVE + '/node_modules/keep.txt', 'do-not-copy')
}

function makeTxn(fs: ReturnType<typeof createMemoryFs>, txnId = 'web-20260821230000') {
  const journalEntries: { op: string; ok: boolean }[] = []
  return {
    txn: createCandidateTransaction({
      fs,
      home: HOME,
      profile: 'web',
      now: () => '2026-08-21T23:00:00.000Z',
      txnId: () => txnId,
      journal: { append: async (entry) => { journalEntries.push(entry) } },
    }),
    journalEntries,
  }
}

describe('candidate transaction', () => {
  it('stages by copying files into the staging tree, leaving live intact', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await txn.stage()
    expect(txn.phase()).toBe('staged')
    expect(await fs.readText('/h/profiles/.doctor-staging/web/web-20260821230000/package.json')).toBe('{"name":"web"}')
    expect(await fs.readText('/h/profiles/.doctor-staging/web/web-20260821230000/node_modules/keep.txt')).toBe('do-not-copy')
    expect(await fs.readText(LIVE + '/package.json')).toBe('{"name":"web"}')
  })

  it('promote swaps the candidate in and quarantines the original', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await txn.stage()
    await fs.writeText('/h/profiles/.doctor-staging/web/web-20260821230000/package.json', '{"name":"web","version":2}')
    await txn.promote()
    expect(txn.phase()).toBe('promoted')
    expect(await fs.readText(LIVE + '/package.json')).toBe('{"name":"web","version":2}')
    expect(await fs.exists('/h/.dsh-doctor/quarantine/web/web-20260821230000/original/package.json')).toBe(true)
    expect(await fs.readText('/h/.dsh-doctor/quarantine/web/web-20260821230000/original/cordis.patch.yml')).toBe(`[]
`)
  })

  it('rollback restores the quarantined original', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await txn.stage()
    await txn.promote()
    await txn.rollback()
    expect(txn.phase()).toBe('rolled-back')
    expect(await fs.readText(LIVE + '/package.json')).toBe('{"name":"web"}')
    expect(await fs.exists('/h/.dsh-doctor/quarantine/web/web-20260821230000/original')).toBe(false)
  })

  it('abort before promote discards staging and touches nothing else', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await txn.stage()
    await txn.abort()
    expect(txn.phase()).toBe('aborted')
    expect(await fs.exists('/h/profiles/.doctor-staging/web')).toBe(false)
    expect(await fs.readText(LIVE + '/package.json')).toBe('{"name":"web"}')
  })

  it('refuses to promote before staging', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await expect(txn.promote()).rejects.toMatchObject({ code: 'TXN_STATE' })
  })

  it('restores the original when the second rename fails', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await txn.stage()
    const originalRename = fs.rename.bind(fs)
    let calls = 0
    const fsSabotaged = {
      ...fs,
      rename: (from: string, to: string) => {
        calls += 1
        if (calls === 2) throw new FsError('EBUSY', to, 'injected')
        return originalRename(from, to)
      },
    }
    const failed = createCandidateTransaction({ fs: fsSabotaged, home: HOME, profile: 'web', now: () => '2026-08-21T23:00:00.000Z', txnId: () => 'web-20260821230000' })
    await failed.stage()
    await expect(failed.promote()).rejects.toMatchObject({ code: 'TXN_STATE' })
    expect(await fs.exists(LIVE + '/package.json')).toBe(true)
    expect(await fs.readText(LIVE + '/package.json')).toBe('{"name":"web"}')
  })

  it('records each step in the candidate record and journals every step', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn, journalEntries } = makeTxn(fs)
    await txn.stage()
    await txn.promote()
    await txn.commit()
    expect(txn.phase()).toBe('committed')
    expect(txn.record.steps.map((step) => step.step)).toEqual(['stage-copy', 'promote-quarantine', 'promote-activate'])
    expect(journalEntries.filter((e) => e.ok).length).toBe(4)
    expect(txn.record.quarantinePath).toContain('quarantine')
  })

  it('commit requires promoted state', async () => {
    const fs = createMemoryFs()
    await seedLive(fs)
    const { txn } = makeTxn(fs)
    await expect(txn.commit()).rejects.toMatchObject({ code: 'TXN_STATE' })
  })
})

