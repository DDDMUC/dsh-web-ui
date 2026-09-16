/**
 * Allowlist parsing and composition: the settings.yaml web_settings_namespaces
 * key (list and map shapes), package-name aliasing, and the registered-set
 * intersection that keeps the bridge from surfacing anything unknown.
 */

import { describe, expect, it } from 'vitest'
import { composeAllowlist, extractWebSettingsNamespaces, resolveNamespaceEntry } from '../src/allowlist.ts'

describe('extractWebSettingsNamespaces', () => {
  it('reads a block list', () => {
    const text = [
      'web_settings_namespaces:',
      '  - dsh-ssh',
      '  - dsh-client-ui-task-board',
      '  - "dsh-skins"',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-ssh', 'dsh-client-ui-task-board', 'dsh-skins'])
  })

  it('reads a block map', () => {
    const text = [
      'web_settings_namespaces:',
      '  dsh-remote-web-ui: true',
      '  dsh-pet: {}',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-remote-web-ui', 'dsh-pet'])
  })

  it('reads an inline flow list', () => {
    expect(extractWebSettingsNamespaces('web_settings_namespaces: [dsh-ssh, "dsh-skins"]')).toEqual(['dsh-ssh', 'dsh-skins'])
  })

  it('skips comment lines and stops at the next top-level key', () => {
    const text = [
      'web_settings_namespaces:',
      '  - dsh-ssh',
      '  # a comment',
      'llm:',
      '  provider: x',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-ssh'])
  })

  it('reads a block list when the key line carries a trailing comment', () => {
    const text = [
      'web_settings_namespaces:  # expose only task-board',
      '  - task-board',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['task-board'])
  })

  it('reads an unindented block list (YAML allows column-0 sequence items)', () => {
    const text = [
      'web_settings_namespaces:',
      '- dsh-ssh',
      '- dsh-remote-web-ui',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-ssh', 'dsh-remote-web-ui'])
  })

  it('returns the empty list when the key is absent or the file is empty', () => {
    expect(extractWebSettingsNamespaces('llm:\n  provider: x\n')).toEqual([])
    expect(extractWebSettingsNamespaces('')).toEqual([])
  })
})

describe('resolveNamespaceEntry', () => {
  it('maps package names onto their settings namespaces', () => {
    expect(resolveNamespaceEntry('dsh-client-ui-task-board')).toBe('task-board')
    expect(resolveNamespaceEntry('dsh-skins')).toBe('skin-background')
    expect(resolveNamespaceEntry('dsh-ssh')).toBe('dsh-ssh')
  })

  it('passes bare family namespaces through', () => {
    expect(resolveNamespaceEntry('pet')).toBe('pet')
    expect(resolveNamespaceEntry('remote-web-ui')).toBe('remote-web-ui')
    expect(resolveNamespaceEntry('community-plugins')).toBe('community-plugins')
  })

  it('maps the market and skin custom-theme / wallpaper namespaces (#1176, #1370)', () => {
    expect(resolveNamespaceEntry('dsh-market')).toBe('dsh-market')
    expect(resolveNamespaceEntry('dshmarket')).toBe('dsh-market')
    expect(resolveNamespaceEntry('dsh-client-ui-market')).toBe('dsh-market')
    expect(resolveNamespaceEntry('dsh-web-ui-market')).toBe('dsh-market')
    expect(resolveNamespaceEntry('market')).toBe('dsh-market')
    expect(resolveNamespaceEntry('skin-custom-theme')).toBe('skin-custom-theme')
    expect(resolveNamespaceEntry('skin-wallpaper')).toBe('skin-wallpaper')
    // These four plugins register a `dsh-` prefixed namespace, so the bare family
    // name is an alias for it -- resolving to the bare name would drop the entry
    // against the registered set and hide the form (the drift this pins).
    expect(resolveNamespaceEntry('usage')).toBe('dsh-usage')
    expect(resolveNamespaceEntry('doctor')).toBe('doctor')
    expect(resolveNamespaceEntry('liangshen')).toBe('dsh-liangshen')
    expect(resolveNamespaceEntry('session-archive')).toBe('dsh-session-archive')
  })

  it('ignores packages without a settings namespace and unknown names', () => {
    expect(resolveNamespaceEntry('dsh-web')).toBeUndefined()
    expect(resolveNamespaceEntry('dsh-client-ui-web-ui-settings')).toBeUndefined()
    expect(resolveNamespaceEntry('something-else')).toBeUndefined()
  })
})

describe('composeAllowlist', () => {
  // The namespaces the family plugins actually register, plus an unrelated one
  // the allowlist must never invent.
  const registered = [
    'dsh-ssh',
    'task-board',
    'remote-web-ui',
    'pet',
    'skin-background',
    'skin-custom-theme',
    'skin-wallpaper',
    'community-plugins',
    'dsh-web-ui-market',
    'web-search-deepseek',
  ]

  it('falls back to the family list when the user configured none', () => {
    expect(composeAllowlist([], registered)).toEqual([
      'community-plugins',
      'dsh-ssh',
      'dsh-web-ui-market',
      'pet',
      'remote-web-ui',
      'skin-background',
      'skin-custom-theme',
      'skin-wallpaper',
      'task-board',
    ])
  })

  it('honors user entries, deduplicates, and ignores unknown names', () => {
    expect(composeAllowlist(['dsh-client-ui-task-board', 'dsh-skins', 'dsh-ssh', 'dsh-market', 'nope'], registered))
      .toEqual(['dsh-ssh', 'dsh-web-ui-market', 'skin-background', 'task-board'])
  })

  it('resolves official dshmarket registered as dsh-market (#1370)', () => {
    const officialRegistered = ['dsh-market', 'task-board']
    expect(composeAllowlist([], officialRegistered)).toEqual(['dsh-market', 'task-board'])
    expect(composeAllowlist(['dsh-market'], officialRegistered)).toEqual(['dsh-market'])
    expect(composeAllowlist(['dshmarket'], officialRegistered)).toEqual(['dsh-market'])
    expect(composeAllowlist(['dsh-web-ui-market'], officialRegistered)).toEqual(['dsh-market'])
  })

  it('drops namespaces not registered in the settings seam', () => {
    expect(composeAllowlist(['dsh-ssh'], ['web-search-deepseek'])).toEqual([])
    expect(composeAllowlist([], [])).toEqual([])
  })

  it('keeps every family namespace whose plugin registers a dsh- prefixed name', () => {
    // The family drifted once: usage, liangshen and session-archive register a
    // dsh- prefixed namespace while the fallback list still carried the bare
    // name. The intersection then emptied and four configuration forms vanished
    // with no error anywhere. This pins the composed list against the names the
    // plugins actually register.
    const actuallyRegistered = [
      'dsh-ssh',
      'task-board',
      'remote-web-ui',
      'pet',
      'describe-image',
      'skin-background',
      'skin-wallpaper',
      'dsh-web-ui-market',
      'dsh-usage',
      'dsh-model-capabilities',
      'doctor',
      'dsh-liangshen',
      'dsh-session-archive',
    ]
    const composed = composeAllowlist([], actuallyRegistered)
    expect(composed).toContain('dsh-usage')
    expect(composed).toContain('dsh-liangshen')
    expect(composed).toContain('dsh-session-archive')
    expect(composed).toContain('dsh-model-capabilities')
    // And the bare names must not be handed back as if they were real namespaces:
    // nothing registered them, so targeting one would write nowhere.
    for (const bare of ['usage', 'liangshen', 'session-archive']) {
      expect(composed).not.toContain(bare)
    }
  })

  it('resolves a user entry written as the bare family name onto the real namespace', () => {
    // A user who wrote the old bare name must still reach the plugin: the alias
    // maps it forward rather than resolving to a namespace no one registered.
    const registered = ['dsh-usage', 'dsh-liangshen', 'dsh-session-archive']
    expect(composeAllowlist(['usage'], registered)).toEqual(['dsh-usage'])
    expect(composeAllowlist(['liangshen'], registered)).toEqual(['dsh-liangshen'])
    expect(composeAllowlist(['session-archive'], registered)).toEqual(['dsh-session-archive'])
  })
})
