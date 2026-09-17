/**
 * LiangShen settings card: availability and the wire presentation. Registers
 * into the `web-ui.plugin.item` child slot the Web UI plugin group renders,
 * bound to the `dsh-liangshen` namespace.
 *
 * The presentation field does not act on this client half: the Host writes it
 * into the synced preset composition, so a session reads it from its preset.
 * This card is the operator's only handle on it, which is why every field the
 * Host schema carries appears here.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { BooleanField, ChoiceField, PluginSettingsCard } from './PluginSettingsCard.tsx'
import { CardForm, booleanField, choiceField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'

/** Wire presentations the tool catalog accepts (mirrors the Host schema). */
export const PRESENTATION_CHOICES = ['ptc', 'native', 'both'] as const

/** The LiangShen fields this card edits (the namespace's full schema). */
export interface LiangShenSettings {
  /** Master switch for the plugin. */
  enabled?: boolean
  /** Whether the plugin announces itself in every agent's system prompt. */
  announceToAgent?: boolean
  /** Wire presentation written into the synced preset. */
  presentation?: string
}

/** What the LiangShen card renders. */
export interface LiangShenSettingsCardState extends CardShell {
  enabled: CardFieldState
  announceToAgent: CardFieldState
  presentation: CardFieldState
}

/** The registration-side face the card's slot entry injects. */
export interface LiangShenSettingsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useLiangShenSettingsCard. */
    liangShenSettingsCard: SnapshotStore<LiangShenSettingsCardState>
  }
}

/** Bridges the `dsh-liangshen` scope onto the card's staged form. */
export class LiangShenSettingsCardController {
  private readonly form: CardForm<LiangShenSettings>
  private readonly store: SnapshotStore<LiangShenSettingsCardState>

  /** @param scope - the bound settings scope for the `dsh-liangshen` namespace. */
  constructor(scope: SettingsScope<LiangShenSettings>) {
    this.form = new CardForm(scope, [
      booleanField('enabled'),
      booleanField('announceToAgent'),
      choiceField('presentation', PRESENTATION_CHOICES),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): LiangShenSettingsCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      announceToAgent: this.form.field('announceToAgent'),
      presentation: this.form.field('presentation'),
    }
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): LiangShenSettingsCardFace {
    return { hooks: { liangShenSettingsCard: this.store }, ...this.form.actions() }
  }

  /** Release the card's scope subscription and bound stores. */
  dispose(): void {
    this.form.dispose()
  }
}

/** Props the renderer binds for the LiangShen card. */
export type LiangShenSettingsCardProps =
  PropsRuntime<'web-ui.plugin.item'>
  & PropsLocale<'liangshen'>
  & InjectFace<LiangShenSettingsCardFace>

/**
 * Render the LiangShen card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function LiangShenSettingsCard(props: LiangShenSettingsCardProps) {
  const { t } = props
  const state = props.useLiangShenSettingsCard((snapshot: LiangShenSettingsCardState) => snapshot)
  const fieldProps = {
    overriddenLabel: t('settings.overridden'),
    resetLabel: t('settings.reset'),
    invalidLabel: t('settings.invalidValue'),
    disabled: !state.writable,
    inheritLabel: t('settings.inherit'),
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
      <BooleanField
        id="settings-liangshen-enabled"
        label={t('settings.enabled')}
        hint={t('settings.enabledHint')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...fieldProps}
        {...state.enabled}
        onEdit={(text) => { props.edit('enabled', text) }}
        onReset={() => { props.resetField('enabled') }}
      />
      <BooleanField
        id="settings-liangshen-announce"
        label={t('settings.announceToAgent')}
        hint={t('settings.announceToAgentHint')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...fieldProps}
        {...state.announceToAgent}
        onEdit={(text) => { props.edit('announceToAgent', text) }}
        onReset={() => { props.resetField('announceToAgent') }}
      />
      <ChoiceField
        id="settings-liangshen-presentation"
        label={t('settings.presentation')}
        hint={t('settings.presentationHint')}
        choices={PRESENTATION_CHOICES.map(choice => ({ value: choice, label: t(`presentation.${choice}`) }))}
        {...fieldProps}
        {...state.presentation}
        onEdit={(text) => { props.edit('presentation', text) }}
        onReset={() => { props.resetField('presentation') }}
      />
    </PluginSettingsCard>
  )
}
