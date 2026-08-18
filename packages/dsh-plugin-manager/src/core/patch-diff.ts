/**
 * Layer diffing for the gateway host half: the profile patch rows and the
 * bundle list before an install are compared with the state after the
 * official CLI finishes, so the tab can render exactly what the install
 * changed — rows disabled or claimed, bundles added or removed — as a
 * reversible, attributable notice. Pure logic shared by both halves.
 * @module @linxin666/dsh-client-ui-plugin-manager/core
 */

/** Row/bundle membership state used by the diff. */
export type LayerState = 'enabled' | 'disabled' | 'uninstalled'

/** One layer snapshot: row enablement by id plus the bundle list. */
export interface LayerSnapshot {
  rows: ReadonlyMap<string, boolean>
  bundles: readonly string[]
}

/** One observed membership change between two snapshots. */
export interface LayerChange {
  id: string
  from: LayerState
  to: LayerState
}

/**
 * Diff two layer snapshots by id. Only entries whose membership state moved
 * are reported; unchanged entries are skipped.
 * @param before - snapshot taken before the operation.
 * @param after - snapshot taken after the operation.
 * @returns one change per moved id, sorted by id.
 */
export function diffLayer(before: LayerSnapshot, after: LayerSnapshot): LayerChange[] {
  const ids = new Set<string>()
  for (const id of before.rows.keys()) ids.add(id)
  for (const id of after.rows.keys()) ids.add(id)
  for (const bundle of before.bundles) ids.add(bundle)
  for (const bundle of after.bundles) ids.add(bundle)

  const stateOf = (snapshot: LayerSnapshot, id: string): LayerState => {
    const row = snapshot.rows.get(id)
    if (row !== undefined) return row ? 'enabled' : 'disabled'
    if (snapshot.bundles.includes(id)) return 'enabled'
    return 'uninstalled'
  }

  const changes: LayerChange[] = []
  for (const id of ids) {
    const from = stateOf(before, id)
    const to = stateOf(after, id)
    if (from !== to) changes.push({ id, from, to })
  }
  return changes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
