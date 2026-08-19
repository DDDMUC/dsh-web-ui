/**
 * The install-source mapping: install spec selection (npm over repo), the
 * conservative git URL normalization, and the installed-snapshot matcher
 * (npm entries match the row's package identity with the spec as fallback;
 * git entries match normalized URLs).
 */

import { describe, expect, it } from 'vitest'
import { entryInstalled, installSpec, normalizeGitUrl } from '../src/client/install-source.ts'
import type { InstalledPluginItem } from '../src/client/plugin-manager-bridge.ts'
import type { CommunityPluginEntry } from '../src/client/generated/community.ts'

const NPM_ENTRY: CommunityPluginEntry = {
  id: 'dsh-sample',
  name: 'Sample',
  nameEn: 'Sample',
  author: 'someone',
  repo: 'https://github.com/someone/dsh-sample',
  npm: '@someone/dsh-sample',
}

const GIT_ENTRY: CommunityPluginEntry = {
  id: 'dsh-beta',
  name: 'Beta',
  nameEn: 'Beta',
  author: 'bob',
  repo: 'https://github.com/bob/dsh-beta',
}

function installed(spec: string, kind: 'npm' | 'git', id = 'row'): InstalledPluginItem {
  return {
    id,
    name: id,
    version: '1.0.0',
    source: { kind, spec },
    installedAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
  }
}

describe('installSpec', () => {
  it('prefers the npm package name when the entry is published', () => {
    expect(installSpec(NPM_ENTRY)).toBe('@someone/dsh-sample')
  })

  it('falls back to the repository URL without npm', () => {
    expect(installSpec(GIT_ENTRY)).toBe('https://github.com/bob/dsh-beta')
  })
})

describe('normalizeGitUrl', () => {
  it('strips the transport prefix, trailing slash, and .git suffix', () => {
    expect(normalizeGitUrl('https://github.com/Bob/dsh-beta.git/')).toBe('github.com/bob/dsh-beta')
    expect(normalizeGitUrl('https://github.com/bob/dsh-beta')).toBe('github.com/bob/dsh-beta')
    expect(normalizeGitUrl('http://github.com/bob/dsh-beta.git')).toBe('github.com/bob/dsh-beta')
  })

  it('folds scp-style and ssh remotes onto the https form', () => {
    expect(normalizeGitUrl('git@github.com:bob/dsh-beta.git')).toBe('github.com/bob/dsh-beta')
    expect(normalizeGitUrl('ssh://git@github.com/bob/dsh-beta')).toBe('github.com/bob/dsh-beta')
    expect(normalizeGitUrl('git://github.com/bob/dsh-beta/')).toBe('github.com/bob/dsh-beta')
  })

  it('folds pnpm shorthands and git+ wrappers recorded in package.json', () => {
    expect(normalizeGitUrl('github:bob/dsh-beta')).toBe('github.com/bob/dsh-beta')
    expect(normalizeGitUrl('gitlab:bob/dsh-beta.git')).toBe('gitlab.com/bob/dsh-beta')
    expect(normalizeGitUrl('bitbucket:bob/dsh-beta')).toBe('bitbucket.org/bob/dsh-beta')
    expect(normalizeGitUrl('git+https://github.com/bob/dsh-beta.git')).toBe('github.com/bob/dsh-beta')
  })

  it('keeps distinct repositories distinct', () => {
    expect(normalizeGitUrl('https://github.com/bob/dsh-beta'))
      .not.toBe(normalizeGitUrl('https://github.com/bob/dsh-beta2'))
    expect(normalizeGitUrl('https://github.com/bob/dsh-beta'))
      .not.toBe(normalizeGitUrl('https://gitlab.com/bob/dsh-beta'))
  })
})

describe('entryInstalled', () => {
  it('matches an npm entry on the row package identity (range spec)', () => {
    // Gateway rows record the dependency RANGE as the spec; identity is id/name.
    expect(entryInstalled(NPM_ENTRY, [installed('^1.0.0', 'npm', '@someone/dsh-sample')])?.id).toBe('@someone/dsh-sample')
  })

  it('falls back to the exact npm spec when the row identity differs', () => {
    expect(entryInstalled(NPM_ENTRY, [installed('@someone/dsh-sample', 'npm')])?.id).toBe('row')
    expect(entryInstalled(NPM_ENTRY, [installed('@someone/dsh-sample@1.0.0', 'npm')])).toBeNull()
    expect(entryInstalled(NPM_ENTRY, [installed('@other/dsh-sample', 'npm')])).toBeNull()
    expect(entryInstalled(NPM_ENTRY, [installed('^1.0.0', 'npm', '@other/dsh-sample')])).toBeNull()
  })

  it('does not match an npm entry against a same-repository git install', () => {
    expect(entryInstalled(NPM_ENTRY, [installed('https://github.com/someone/dsh-sample', 'git')])).toBeNull()
  })

  it('matches a git entry across case, .git suffix, and trailing slash', () => {
    expect(entryInstalled(GIT_ENTRY, [installed('https://github.com/Bob/dsh-beta.git', 'git')])?.id).toBe('row')
    expect(entryInstalled(GIT_ENTRY, [installed('https://github.com/bob/dsh-beta/', 'git')])).not.toBeNull()
    expect(entryInstalled(GIT_ENTRY, [installed('git@github.com:bob/dsh-beta.git', 'git')])).not.toBeNull()
  })

  it('ignores npm-kind rows for git entries and unrelated repositories', () => {
    expect(entryInstalled(GIT_ENTRY, [installed('dsh-beta', 'npm')])).toBeNull()
    expect(entryInstalled(GIT_ENTRY, [installed('https://github.com/bob/other', 'git')])).toBeNull()
    expect(entryInstalled(GIT_ENTRY, [])).toBeNull()
  })
})
