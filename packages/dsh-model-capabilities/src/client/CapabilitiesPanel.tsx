/**
 * Models-page provider-card extension area: per-model capability declarations
 * for one pi-ai provider route.
 *
 * The slot owner passes the card's directory row (`provider.settingsNs` /
 * `provider.settingsPath` address the profile inside the settings document)
 * and the apply body injects the settings namespace face; this panel reads the
 * redacted namespace view over the remote settings wire, drafts image-input
 * and reasoning-effort declarations per model, and saves them as one
 * whole-array path op with revision fencing — the same write granularity and
 * conflict posture the official card uses.
 *
 * A missing namespace or a refused read renders the failure inline, never a
 * blank: the extension area must not read as a missing plugin.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/CapabilitiesPanel
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls the generated settings-namespace methods (describe/mutate)
// into ClientRemote — the repo's dependency graph does not carry the
// api-remotes full assembly, so this augmentation must be imported directly.
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
// View types from their owning package (the api-remotes re-export resolves to
// `any` in this repo's dependency graph).
import type { SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-settings/types'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import {
  buildModelsOp,
  declaredLevelsOf,
  effortsModeOf,
  imageInputOf,
  modelsArrayOf,
  readAt,
  sanitizeEntry,
  THINKING_LEVELS,
  validateEntry,
  withEffortsMode,
  withImageInput,
  COMMON_EFFORTS_PRESET,
  type CapabilitiesIssue,
  type ModelEntryDraft,
  type ModelThinkingLevel,
} from '../core/capabilities.ts'
import { t } from './locales.ts'
import css from './capabilities.module.css'

/**
 * The settings namespace face this panel needs. Typed locally (the generated
 * `ClientRemote['settings']` resolves to `any` fields under this repo's
 * dependency graph, because skipLibCheck swallows the settings-controller
 * d.ts's own unresolved imports).
 */
export interface SettingsNamespaceFace {
  describe(): Promise<RemoteResult<SettingsDescribeValue>>
  mutate(ns: string, ops: readonly SettingsPathOpView[], expectedRevision: number | undefined): Promise<RemoteResult<SettingsNamespaceView>>
}

/** Component props: the slot's owner share plus the settings namespace face. */
export interface CapabilitiesPanelProps extends ProviderCardExtrasOwnerProps {
  /** The generated remote settings namespace (extracted by the apply body, which declares the dotted inject). */
  settings: SettingsNamespaceFace
}

/** One view snapshot the panel renders from. */
interface Snapshot {
  /** Effective entries: the user layer's array when it owns one, else the resolved one. */
  entries: ModelEntryDraft[]
  /** True when the array came from a non-user layer (first save materializes the override). */
  inherited: boolean
  /** Namespace revision the snapshot was read at (the write's fence). */
  revision: number
  /** Whether the settings provider accepts writes. */
  writable: boolean
}

type Phase = { kind: 'loading' } | { kind: 'error', message: string } | { kind: 'ready' }

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict' }
  | { kind: 'failed', message: string }

/** Extract a display text from a remote failure (the host diagnostic, or its code). */
function failureText(error: RemoteFailure): string {
  return typeof error.message === 'string' && error.message.length > 0 ? error.message : error.code
}

/** Deep-clone one entry through JSON so draft edits never alias stored state. */
function cloneEntry(entry: ModelEntryDraft): ModelEntryDraft {
  return JSON.parse(JSON.stringify(sanitizeEntry(entry))) as ModelEntryDraft
}

/**
 * Render the capability editor for one provider card.
 * @param props - the card's directory row, its configured facts, and the settings face.
 * @returns the extension area.
 */
export function CapabilitiesPanel(props: CapabilitiesPanelProps) {
  const { provider, settings } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)
  const [draft, setDraft] = useState<ModelEntryDraft[] | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })

  const settingsPath = useMemo(() => [...provider.settingsPath], [provider.settingsPath])
  /** The models array lives one level below the profile the settings path addresses. */
  const modelsPath = useMemo(() => [...settingsPath, 'models'], [settingsPath])
  const entries = draft ?? snapshot?.entries ?? []

  const load = useCallback(async (face: SettingsNamespaceFace) => {
    setPhase({ kind: 'loading' })
    try {
      const described = await face.describe()
      if (!described.ok) throw new Error(failureText(described.error))
      const view = described.value.namespaces.find(candidate => candidate.ns === provider.settingsNs)
      if (view === undefined) {
        throw new Error(`settings namespace "${provider.settingsNs}" is not registered on this host`)
      }
      const userModels = modelsArrayOf(readAt(view.user, modelsPath))
      const effective = userModels ?? modelsArrayOf(readAt(view.value, modelsPath)) ?? []
      setSnapshot({
        entries: effective,
        inherited: userModels === undefined,
        revision: view.revision,
        writable: described.value.writable,
      })
      setDraft(null)
      setPhase({ kind: 'ready' })
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [modelsPath, provider.settingsNs, settingsPath])

  useEffect(() => {
    void load(settings)
  }, [load, settings])

  const editing = phase.kind === 'ready' && snapshot !== undefined
  const readOnly = editing && !snapshot.writable
  const dirty = draft !== null

  const updateEntry = (index: number, next: ModelEntryDraft) => {
    if (!editing || readOnly) return
    setDraft(current => {
      const base = current ?? snapshot.entries.map(cloneEntry)
      const clone = base.map(entry => ({ ...entry }))
      clone[index] = next
      return clone
    })
    setSave({ kind: 'idle' })
  }

  const discard = () => {
    setDraft(null)
    setSave({ kind: 'idle' })
  }

  const firstIssue = useMemo<CapabilitiesIssue | undefined>(() => {
    for (const entry of draft ?? []) {
      const issue = validateEntry(entry)
      if (issue !== undefined) return issue
    }
    return undefined
  }, [draft])

  const doSave = async () => {
    if (!editing || readOnly || draft === null || snapshot === undefined) return
    if (firstIssue !== undefined) return
    const op = buildModelsOp(settingsPath, draft)
    setSave({ kind: 'saving' })
    try {
      const written = await settings.mutate(provider.settingsNs, [op], snapshot.revision)
      if (written.ok) {
        const userModels = modelsArrayOf(readAt(written.value.user, modelsPath)) ?? []
        setSnapshot({
          entries: userModels,
          inherited: false,
          revision: written.value.revision,
          writable: true,
        })
        setDraft(null)
        setSave({ kind: 'saved' })
        return
      }
      if (written.error.code === 'settings/conflict') {
        setSave({ kind: 'conflict' })
        await load(settings)
        return
      }
      setSave({ kind: 'failed', message: failureText(written.error) })
    } catch (error) {
      setSave({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <section className={css.panel} data-dsh-plugin="model-capabilities" data-dsh-part="panel">
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        data-dsh-part="toggle"
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.title}>{t('caps.title')}</span>
        {dirty ? <span className={css.pending}>{t('caps.dirty')}</span> : null}
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron}
        >
          <path d="M2.5 5l4.5 4.5L11.5 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open
        ? (
            <div className={css.body}>
              <p className={css.hint}>{t('caps.hint')}</p>
              {phase.kind === 'loading' ? <p className={css.status} role="status">{t('caps.loading')}</p> : null}
              {phase.kind === 'error'
                ? (
                    <div className={css.statusRow}>
                      <p className={css.failed} role="alert">{t('caps.loadFailed', { error: phase.message })}</p>
                      <button type="button" className={css.ghost} data-dsh-part="reload" onClick={() => { void load(settings) }}>
                        {t('caps.reload')}
                      </button>
                    </div>
                  )
                : null}
              {phase.kind === 'ready' && snapshot !== undefined
                ? (
                    <>
                      {readOnly ? <p className={css.readOnly} role="status">{t('caps.readOnly')}</p> : null}
                      {snapshot.entries.length === 0
                        ? <p className={css.status} role="status">{t('caps.empty')}</p>
                        : (
                            <ul className={css.rows}>
                              {entries.map((entry, index) => (
                                <ModelRow
                                  key={typeof entry.id === 'string' ? entry.id : index}
                                  entry={entry}
                                  expanded={expandedId === entry.id}
                                  disabled={readOnly}
                                  onToggle={() => { setExpandedId(expandedId === entry.id ? null : entry.id) }}
                                  onChange={next => { updateEntry(index, next) }}
                                />
                              ))}
                            </ul>
                          )}
                      <div className={css.footer}>
                        {save.kind === 'saved' ? <p className={css.status} role="status">{t('caps.saved')}</p> : null}
                        {save.kind === 'conflict' ? <p className={css.failed} role="alert">{t('caps.conflict')}</p> : null}
                        {save.kind === 'failed' ? <p className={css.failed} role="alert">{t('caps.failed', { error: save.message })}</p> : null}
                        {firstIssue?.kind === 'effortsWireMissing'
                          ? <p className={css.failed} role="alert">{t('caps.invalid.wire', { level: firstIssue.level })}</p>
                          : null}
                        {firstIssue?.kind === 'effortsOffOnly'
                          ? <p className={css.failed} role="alert">{t('caps.invalid.offOnly')}</p>
                          : null}
                        <span className={css.spacer} />
                        <button
                          type="button"
                          className={css.ghost}
                          data-dsh-part="reset"
                          disabled={!dirty || save.kind === 'saving'}
                          onClick={discard}
                        >
                          {t('caps.discard')}
                        </button>
                        <button
                          type="button"
                          className={css.primary}
                          data-dsh-part="save"
                          disabled={!dirty || readOnly || save.kind === 'saving' || firstIssue !== undefined}
                          onClick={() => { void doSave() }}
                        >
                          {save.kind === 'saving' ? t('caps.saving') : t('caps.save')}
                        </button>
                      </div>
                    </>
                  )
                : null}
            </div>
          )
        : null}
    </section>
  )
}

/** Props of one model's capability row. */
interface ModelRowProps {
  /** The draft entry this row edits. */
  entry: ModelEntryDraft
  /** Whether the editor body is expanded. */
  expanded: boolean
  /** Disables every control (read-only document). */
  disabled: boolean
  /** Expand/collapse toggle. */
  onToggle: () => void
  /** Stage the next entry draft. */
  onChange: (next: ModelEntryDraft) => void
}

/**
 * One model row: a collapsed summary header (image claim + reasoning levels)
 * and the expanded tri-state editor with per-level wire spellings.
 */
function ModelRow(props: ModelRowProps) {
  const { entry, expanded, disabled, onToggle, onChange } = props
  const radioName = useId()
  const image = imageInputOf(entry)
  const mode = effortsModeOf(entry)
  const levels = declaredLevelsOf(entry)

  /** Stored wire map (editors toggle against it). */
  const storedLevels = () => new Map(levels.map(({ level, wire }) => [level, wire] as const))

  const setEffortsMode = (next: 'inherit' | 'none' | 'levels') => {
    if (next === 'levels') {
      const stored = storedLevels()
      if (stored.size === 0) {
        // A fresh declaration materializes the common preset instead of an
        // empty dict, which the adapter would refuse.
        for (const [level, wire] of COMMON_EFFORTS_PRESET) stored.set(level, wire)
      }
      onChange(withEffortsMode(entry, 'levels', stored))
      return
    }
    onChange(withEffortsMode(entry, next))
  }

  const toggleLevel = (level: ModelThinkingLevel) => {
    const stored = storedLevels()
    if (stored.has(level)) stored.delete(level)
    else stored.set(level, level === 'off' ? '' : level)
    onChange(withEffortsMode(entry, 'levels', stored))
  }

  const setWire = (level: ModelThinkingLevel, wire: string) => {
    const stored = storedLevels()
    stored.set(level, wire)
    onChange(withEffortsMode(entry, 'levels', stored))
  }

  const applyCommonPreset = () => {
    onChange(withEffortsMode(entry, 'levels', new Map(COMMON_EFFORTS_PRESET.map(([level, wire]) => [level, wire] as const))))
  }

  const summaryChips: string[] = []
  if (image === true) summaryChips.push(t('caps.summary.image'))
  else if (image === false) summaryChips.push(t('caps.summary.textOnly'))
  if (mode === 'none') summaryChips.push(t('caps.summary.noReasoning'))
  else if (mode === 'levels') {
    const named = levels.filter(({ level }) => level !== 'off').map(({ level }) => level)
    if (named.length > 0) summaryChips.push(t('caps.summary.efforts', { levels: named.join('/') }))
  }

  return (
    <li className={css.row} data-dsh-part="model-row">
      <button
        type="button"
        className={css.rowHeader}
        aria-expanded={expanded}
        aria-label={`${t(expanded ? 'caps.model.collapse' : 'caps.model.expand')}: ${entry.id}`}
        data-dsh-part="model-toggle"
        onClick={onToggle}
      >
        <span className={css.modelId}>{entry.id}</span>
        {typeof entry.name === 'string' && entry.name.length > 0 ? <span className={css.modelName}>{entry.name}</span> : null}
        <span className={css.chips}>
          {summaryChips.map(chip => <span key={chip} className={css.chip}>{chip}</span>)}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className={expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron}
        >
          <path d="M2.5 5l4.5 4.5L11.5 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {expanded
        ? (
            <div className={css.rowBody}>
              <div className={css.field} data-dsh-part="image-input">
                <label className={css.checkLabel}>
                  <input
                    type="checkbox"
                    checked={image === true}
                    disabled={disabled}
                    onChange={event => { onChange(withImageInput(entry, event.target.checked)) }}
                  />
                  <span>{t('caps.model.image')}</span>
                </label>
                <p className={css.hint}>{image === undefined ? t('caps.model.image.inherit') : t('caps.model.image.hint')}</p>
              </div>
              <div className={css.field} data-dsh-part="efforts-mode">
                <span className={css.fieldLabel}>{t('caps.model.efforts')}</span>
                <div className={css.modeGroup} role="radiogroup" aria-label={t('caps.model.efforts')}>
                  {(
                    [
                      ['inherit', t('caps.efforts.inherit'), t('caps.efforts.inheritHint')],
                      ['none', t('caps.efforts.none'), t('caps.efforts.noneHint')],
                      ['levels', t('caps.efforts.levels'), t('caps.efforts.levelsHint')],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label key={value} className={mode === value ? `${css.modeOption} ${css.modeOptionActive}` : css.modeOption} title={hint}>
                      <input
                        type="radio"
                        name={`${radioName}-efforts`}
                        value={value}
                        checked={mode === value}
                        disabled={disabled}
                        onChange={() => { setEffortsMode(value) }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className={css.hint}>
                  {mode === 'inherit' ? t('caps.efforts.inheritHint') : mode === 'none' ? t('caps.efforts.noneHint') : t('caps.efforts.levelsHint')}
                </p>
              </div>
              {mode === 'levels'
                ? (
                    <div className={css.levels}>
                      <button type="button" className={css.ghost} disabled={disabled} onClick={applyCommonPreset}>
                        {t('caps.preset.common')}
                      </button>
                      <div className={css.levelChips}>
                        {THINKING_LEVELS.map(level => {
                          const active = levels.some(({ level: declared }) => declared === level)
                          return (
                            <button
                              key={level}
                              type="button"
                              className={active ? `${css.levelChip} ${css.levelChipActive}` : css.levelChip}
                              aria-pressed={active}
                              disabled={disabled}
                              onClick={() => { toggleLevel(level) }}
                            >
                              {level}
                            </button>
                          )
                        })}
                      </div>
                      {levels.map(({ level, wire }) => (
                        <div key={level} className={css.wireRow} data-dsh-part="wire-input">
                          <label className={css.wireLabel} htmlFor={`${radioName}-wire-${level}`}>
                            <code>{level}</code>
                            <span>{t('caps.wire.label')}</span>
                          </label>
                          <input
                            id={`${radioName}-wire-${level}`}
                            className={css.wireInput}
                            type="text"
                            value={wire}
                            placeholder={level}
                            disabled={disabled}
                            onChange={event => { setWire(level, event.target.value) }}
                          />
                        </div>
                      ))}
                      {levels.some(({ level }) => level === 'off') ? <p className={css.hint}>{t('caps.wire.offHint')}</p> : null}
                    </div>
                  )
                : null}
            </div>
          )
        : null}
    </li>
  )
}
