/**
 * Map a community index entry onto the plugin-manager install surface: the
 * install spec (npm package when published, else the contributor repository
 * URL) and a conservative matcher that tells whether one entry is already
 * present in the installed snapshot the 'pluginManager' service serves.
 */

import type { CommunityPluginEntry } from './generated/community.ts'
import type { InstalledPluginItem } from './plugin-manager-bridge.ts'

/**
 * The spec handed to pluginManager.install(): the npm package name when the
 * entry is published there, else the repository URL (git install).
 * @param entry - the community index entry.
 * @returns the install spec.
 */
export function installSpec(entry: CommunityPluginEntry): string {
  return entry.npm ?? entry.repo
}

/**
 * Normalize a git remote for comparison: lowercase, drop the transport
 * prefix ('git+' wrapper, 'https://', 'http://', 'git://', 'ssh://git@', the
 * scp-style 'git@host:' userinfo, and the pnpm host shorthands 'github:' /
 * 'gitlab:' / 'bitbucket:' that package.json records for shorthand installs),
 * then strip trailing slashes and one trailing '.git'
 * suffix (repeated, so 'x/.git/' and 'x.git' converge). Conservative on
 * purpose: no path rewriting beyond those steps, so distinct repositories
 * never collapse onto each other.
 * @param url - the repository URL as recorded by either side.
 * @returns the comparison key.
 */
export function normalizeGitUrl(url: string): string {
  let key = url.trim().toLowerCase()
  // pnpm git wrapper: 'git+https://host/owner/repo' -> 'https://host/owner/repo'.
  key = key.replace(/^git[+]/, '')
  // pnpm host shorthands recorded in package.json: 'github:owner/repo' ->
  // 'github.com/owner/repo' (same for gitlab / bitbucket).
  key = key.replace(/^(github|gitlab):/, '$1.com/')
  key = key.replace(/^bitbucket:/, 'bitbucket.org/')
  // Transport prefixes: 'https://', 'http://', 'git://', 'ssh://git@'.
  key = key.replace(/^(?:https?|git):[/][/]/, '')
  key = key.replace(/^ssh:[/][/]git@/, '')
  // Scp-style ssh remote: 'git@github.com:owner/repo' -> 'github.com/owner/repo'.
  key = key.replace(/^git@([^/:]+):/, '$1/')
  // Strip trailing slashes and a trailing '.git' suffix until stable.
  for (;;) {
    const next = key.replace(/[/]+$/, '').replace(/[.]git$/, '')
    if (next === key) return key
    key = next
  }
}

/**
 * Match one community entry against the installed snapshot. npm-published
 * entries match on the installed row's package identity (id/name): the npm
 * source spec records the dependency RANGE ('^0.3.2') or an install-time
 * spec, not necessarily the bare package name, so it is only a fallback.
 * Repository entries match on the normalized git URL. An entry with an npm
 * field ONLY matches npm installs — a same-repository git install is a
 * different source and stays unmatched (the card then offers install, which
 * the host reconciles).
 * @param entry - the community index entry.
 * @param installed - the installed snapshot from the pluginManager service.
 * @returns the matching installed row, or null.
 */
export function entryInstalled(
  entry: CommunityPluginEntry,
  installed: readonly InstalledPluginItem[],
): InstalledPluginItem | null {
  if (entry.npm !== undefined) {
    return installed.find(
      item => item.source.kind === 'npm'
        && (item.id === entry.npm || item.name === entry.npm || item.source.spec === entry.npm),
    ) ?? null
  }
  const key = normalizeGitUrl(entry.repo)
  return installed.find(
    item => item.source.kind === 'git' && normalizeGitUrl(item.source.spec) === key,
  ) ?? null
}
