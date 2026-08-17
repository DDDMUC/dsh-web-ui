/**
 * The aionui-panel settings card: the right-panel provider choice (issue
 * #307). Registers into the `web-ui.plugin.item` slot the Web UI Plugins
 * group renders, bound to the `aionui-panel` settings namespace through the
 * family settings bridge (or the official settings scope when the deployment
 * exposes the namespace directly). Selecting `dsh-better-sidebar` (the
 * default — aionui is deprecated) keeps the right-panel columns, the
 * floating expand button, the /aionui-panel/* routes and the workspace
 * fs watch + git polling behind them unmounted; selecting `aionui-panel`
 * mounts them.
 * @module @linxin666/dsh-client-ui-aionui-panel/client/AionUiSettingsCard
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChoiceField, PluginSettingsCard } from './PluginSettingsCard.tsx'
import { CardForm, choiceField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'

/** The right-panel providers this card offers. */
export const RIGHT_PANEL_PROVIDERS = ['aionui-panel', 'dsh-better-sidebar'] as const

/** The aionui-panel fields this card edits (the namespace's full schema). */
export interface AionUiPanelSettings {
  /**
   * The active right-panel provider. `dsh-better-sidebar` (default) keeps
   * this panel unmounted; `aionui-panel` mounts it (deprecated provider).
   */
  rightPanel?: 'aionui-panel' | 'dsh-better-sidebar'
}

/** What the aionui-panel card renders. */
export interface AionUiSettingsCardState extends CardShell {
  rightPanel: CardFieldState
}

/** The registration-side face the card's slot entry injects. */
export interface AionUiSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useAionUiSettingsCard. */
    aionUiSettingsCard: SnapshotStore<AionUiSettingsCardState>
  }
}

/** Bridges the `aionui-panel` scope onto the card's staged form. */
export class AionUiSettingsCardController {
  private readonly form: CardForm<AionUiPanelSettings>
  private readonly store: SnapshotStore<AionUiSettingsCardState>

  /** @param scope - the bound settings scope for the `aionui-panel` namespace. */
  constructor(scope: SettingsScope<AionUiPanelSettings>) {
    this.form = new CardForm(scope, [
      choiceField('rightPanel', [...RIGHT_PANEL_PROVIDERS]),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): AionUiSettingsCardState {
    return {
      ...this.form.shell(),
      rightPanel: this.form.field('rightPanel'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): AionUiSettingsCardFace {
    return { hooks: { aionUiSettingsCard: this.store }, ...this.form.actions() }
  }

  /**
   * Release the card's scope subscription and bound stores; the slot
   * disposer calls this on teardown.
   */
  dispose(): void {
    this.form.dispose()
  }
}

/** Props the renderer binds for the aionui-panel card. */
export type AionUiSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'aionui-panel'>
  & InjectFace<AionUiSettingsCardFace>

/**
 * Render the aionui-panel card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function AionUiSettingsCard(props: AionUiSettingsCardProps) {
  const { t } = props
  const state = props.useAionUiSettingsCard(snapshot => snapshot)
  const disabled = !state.writable
  const fieldProps = {
    overriddenLabel: t('settings.overridden'),
    resetLabel: t('settings.reset'),
    invalidLabel: t('settings.invalidNumber'),
    disabled,
  }
  return (
    <PluginSettingsCard
      t={t}
      titleKey="settings.title"
      descriptionKey="settings.description"
      defaultOpen={false}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ChoiceField
        id="settings-aionui-panel-right-panel"
        label={t('settings.rightPanel')}
        hint={t('settings.rightPanelHint')}
        inheritLabel={t('settings.inherit')}
        choices={[
          { value: 'dsh-better-sidebar', label: t('settings.providerBetterSidebar') },
          { value: 'aionui-panel', label: t('settings.providerAionui') },
        ]}
        {...fieldProps}
        {...state.rightPanel}
        onEdit={(text) => { props.edit('rightPanel', text) }}
        onReset={() => { props.resetField('rightPanel') }}
      />
    </PluginSettingsCard>
  )
}
