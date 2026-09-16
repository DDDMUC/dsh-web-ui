/**
 * LiangShen settings card: availability, the wire presentation, and the
 * phase-based reasoning levels. Registers into the `web-ui.plugin.item` child
 * slot the Web UI plugin group renders, bound to the `dsh-liangshen` namespace.
 *
 * The presentation and effort fields do not act on this client half: the Host
 * writes them into the synced preset composition, so a session reads them from
 * its preset. This card is the operator's only handle on them, which is why
 * every field the Host schema carries appears here.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { BooleanField, ChoiceField, PluginSettingsCard } from './PluginSettingsCard.tsx'
import { CardForm, booleanField, choiceField, type CardActions, type CardShell, type FieldState as CardFieldState } from './settings-form.ts'

/** Wire presentations the tool catalog accepts (mirrors the Host schema). */
export const PRESENTATION_CHOICES = ['ptc', 'native', 'both'] as const

/** Reasoning levels the DeepSeek adapter declares (mirrors the Host schema). */
export const EFFORT_CHOICES = ['off', 'low', 'high', 'max'] as const

/** The LiangShen fields this card edits (the namespace's full schema). */
export interface LiangShenSettings {
  /** Master switch for the plugin. */
  enabled?: boolean
  /** Whether the plugin announces itself in every agent's system prompt. */
  announceToAgent?: boolean
  /** Wire presentation written into the synced preset. */
  presentation?: string
  /** Whether the preset takes over the request's reasoning level by phase. */
  autoEffortByPhase?: boolean
  /** Reasoning level while plan mode is forming the work. */
  planningEffort?: string
  /** Reasoning level for single-step execution turns. */
  executionEffort?: string
  /** Reasoning level after a failed step, until a fix lands. */
  reviewEffort?: string
}

/** What the LiangShen card renders. */
export interface LiangShenSettingsCardState extends CardShell {
  enabled: CardFieldState
  announceToAgent: CardFieldState
  presentation: CardFieldState
  autoEffortByPhase: CardFieldState
  planningEffort: CardFieldState
  executionEffort: CardFieldState
  reviewEffort: CardFieldState
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
      booleanField('autoEffortByPhase'),
      choiceField('planningEffort', EFFORT_CHOICES),
      choiceField('executionEffort', EFFORT_CHOICES),
      choiceField('reviewEffort', EFFORT_CHOICES),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): LiangShenSettingsCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      announceToAgent: this.form.field('announceToAgent'),
      presentation: this.form.field('presentation'),
      autoEffortByPhase: this.form.field('autoEffortByPhase'),
      planningEffort: this.form.field('planningEffort'),
      executionEffort: this.form.field('executionEffort'),
      reviewEffort: this.form.field('reviewEffort'),
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
  const effortChoices = EFFORT_CHOICES.map(choice => ({ value: choice, label: t(`effort.${choice}`) }))
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
      <BooleanField
        id="settings-liangshen-auto-effort"
        label={t('settings.autoEffortByPhase')}
        hint={t('settings.autoEffortByPhaseHint')}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        {...fieldProps}
        {...state.autoEffortByPhase}
        onEdit={(text) => { props.edit('autoEffortByPhase', text) }}
        onReset={() => { props.resetField('autoEffortByPhase') }}
      />
      <ChoiceField
        id="settings-liangshen-planning-effort"
        label={t('settings.planningEffort')}
        hint={t('settings.planningEffortHint')}
        choices={effortChoices}
        {...fieldProps}
        {...state.planningEffort}
        onEdit={(text) => { props.edit('planningEffort', text) }}
        onReset={() => { props.resetField('planningEffort') }}
      />
      <ChoiceField
        id="settings-liangshen-execution-effort"
        label={t('settings.executionEffort')}
        hint={t('settings.executionEffortHint')}
        choices={effortChoices}
        {...fieldProps}
        {...state.executionEffort}
        onEdit={(text) => { props.edit('executionEffort', text) }}
        onReset={() => { props.resetField('executionEffort') }}
      />
      <ChoiceField
        id="settings-liangshen-review-effort"
        label={t('settings.reviewEffort')}
        hint={t('settings.reviewEffortHint')}
        choices={effortChoices}
        {...fieldProps}
        {...state.reviewEffort}
        onEdit={(text) => { props.edit('reviewEffort', text) }}
        onReset={() => { props.resetField('reviewEffort') }}
      />
    </PluginSettingsCard>
  )
}
