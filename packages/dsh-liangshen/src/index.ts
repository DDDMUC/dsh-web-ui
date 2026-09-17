/**
 * dsh-liangshen — LiangShen (梁神) agent preset plugin.
 *
 * Host half only: on startup it syncs the bundled `presets/` tree into the
 * harness-home agent-presets root (`~/.dsh/.agent-presets`), making the
 * LiangShen preset selectable for new sessions without copying files by hand.
 * The capability announcement is a system-prompt section that ships OFF by
 * default (`announceToAgent: false`) and can be enabled in the web settings
 * surface (plugin config) or the profile patch. No browser half, no routes,
 * no agent tools — the preset itself provides the tools.
 *
 * The preset combines a minimal persona with a lifetime-declared tool
 * presentation: the system prompt keeps a minimal persona with standing
 * working discipline and workspace instructions, and the wire runs the SDK's
 * 'ptc' presentation by default — the wire collapses to the `run_code`
 * transport and every other tool is reached through the generated SDK,
 * declared once per session instead of staged across a turn boundary
 * ('native' and 'both' are one-line opt-outs). High-fan-out tool families
 * (default `mcp__*`) stay paged out of the executed surface through the
 * host's scoped tool restriction until the preset's own `tool_activate` tool
 * loads their namespace (LRU cap three), with the activation state replayed
 * from the durable session event stream. The tool catalog — listing exactly
 * the tools the request carries plus the paged-out namespace summaries — and a
 * one-line working-context projection travel as durable user messages,
 * republished only on change.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from 'schemastery'
import { dshHome } from './dsh-home.ts'
import { syncPresetTrees } from './sync.ts'
import { mountOnce } from './mount-once.ts'

/** Stable cordis plugin name. */
export const name = 'liangshen'

/** Settings namespace of the plugin (the web settings surface edits it). */
export const LIANGSHEN_SETTINGS_NAMESPACE = 'dsh-liangshen' as SettingsNamespace

/** Prompt assembly must exist before the announcement section can register. */
export const inject = ['systemPrompt']

/** The wire presentations the preset's tool catalog accepts. */
export const PRESENTATION_OPTIONS = ['ptc', 'native', 'both'] as const

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Master switch: when false, neither sync nor announcement runs. */
  enabled?: boolean
  /** When true, a system-prompt section announces the plugin (default false — keep prompts clean unless the user opts in). */
  announceToAgent?: boolean
  /**
   * Wire presentation written into the synced preset's tool-catalog row.
   * `ptc` (default) collapses the wire to the `run_code` transport; `native`
   * keeps the assembled roster; `both` keeps the roster and the transport.
   */
  presentation?: (typeof PRESENTATION_OPTIONS)[number]
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(false),
  presentation: z.union([...PRESENTATION_OPTIONS]).default('ptc'),
})

/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = false
const DEFAULT_PRESENTATION = 'ptc'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/** Model-facing announcement: plugin presence, principle, and limits. */
export const LIANGSHEN_GUIDANCE = '本机已安装 dsh-liangshen 插件（梁神模式 agent preset）：新建会话的预设选择器中可选「梁神模式」。原理：系统提示词保持极简 persona（minimal-prompt 放行该段与 plan 模式的 plan:policy），persona 内置本模式工作纪律（反思熔断——同一假设推演不超过两轮、缺事实立即闭合思考并调用原生检测工具；行动导向——思考只决定下一步具体操作、不在思考中预演代码实现；并发探索——多处独立检查或搜索在单轮内并发发射多个工具调用；YAGNI/PDCA——单步验证单一假设、不写冗余注释），并在组装时追加工作区目录行 Your working directory is <cwd>.。AGENTS.md 工作区指令默认交还宿主自身的 agent-instructions 行，以 user 角色注入，本插件不追加任何系统提示词段、也不改动 pre-step 的消息批次；可选 instructionSource: system-prompt 才由本插件在组装时读取 AGENTS.md 链并追加 workspace-instructions 段（65536 字节预算，每次组装重读）。wire 呈现由 tool-catalog 按会话一次声明，取值 \'ptc\'（默认：wire 收拢为唯一的 run_code，其余工具经生成的 SDK 触达）、\'native\'（组装出的原生清单）或 \'both\'（两者同驻），并可在插件设置界面切换（同步 preset 时写入 tool-catalog 行）；未挂载 code runtime 时不做声明，会话运行原生工具面。温和工具分页：匹配 pagedToolPatterns（默认 mcp__*）的工具在激活前被作用域级工具限制移出可见面（既不在 wire，也不在生成的 SDK 声明中），目录消息列出常驻工具签名与未激活命名空间摘要，调用 tool_activate({ namespace }) 按需激活（LRU 上限 3 个活跃命名空间，驱逐最久未用）；激活状态从持久会话事件流重建，resume/压缩后自然恢复。working-context 插件在 pre-step 注入单行 [Working Context: ...] 就近状态投射（plan 模式、活跃命名空间、进行中 todo 标题，全部从事件流折叠，读不到则省略，全部为空则不注入）。历史工具结果修剪为 4096 字符阈值（head 1500 / tail 500）。文件操作受宿主沙箱约束；shell 在每个平台都挂上游标准 Stdio 栈（POSIX 为 bash，Windows 为 pwsh），带简短描述标题卡片与确定性退出码。真实推理探针通过不等于模式集成通过，更不等于统计效果提升。preset 文件由插件维护于 ~/.dsh/.agent-presets，升级插件时自动更新；默认预设由用户自行选择。用户提到「梁神模式 / 锚定模式 / anchored standard」时即指本插件，请据此协作。'
// The harness-home resolution (DSH_HOME override with the platform-home
// fallback and ~ expansion) lives in the family-shared copy ./dsh-home.ts.
// Re-export it so the plugin surface stays stable while the implementation is
// shared across packages. A relative DSH_HOME resolves against the process CWD
// (absolute), which is the shared contract.
export { dshHome } from './dsh-home.ts'

/** Absolute path of the bundled preset tree inside this package. */
export function bundledPresetsRoot(): string {
  return fileURLToPath(new URL('../presets/', import.meta.url))
}

/**
 * Mount the plugin: sync bundled presets into the harness-home agent-presets
 * root, register the settings namespace (enabled / announceToAgent, live),
 * and announce through a system-prompt section when announceToAgent is on
 * (off by default).
 * @param ctx - host plugin context carrying systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export const apply = mountOnce('@linxin666/dsh-liangshen', applyImpl)

function applyImpl(ctx: Context, config?: Config): void {
  // The live source the announcement reads: the settings section once the web
  // settings surface is served, the composition entry otherwise
  // (installSection swaps it when the namespace registers).
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => ({
    announceToAgent: current().announceToAgent ?? DEFAULT_ANNOUNCE,
    enabled: current().enabled ?? true,
    presentation: current().presentation ?? DEFAULT_PRESENTATION,
  })

  const sync = (): void => {
    const targetRoot = join(dshHome(), '.agent-presets')
    try {
      mkdirSync(targetRoot, { recursive: true })
      const settings = resolve()
      // The settings surface edits this plugin's namespace, while the values that
      // shape a session live in the preset's rows; the sync is where the two meet.
      const result = syncPresetTrees(bundledPresetsRoot(), targetRoot, ['liangshen-exact'], {
        presentation: settings.presentation,
      })
      for (const { id, error } of result.failed) {
        ctx.logger?.warn?.(`dsh-liangshen: preset ${id} sync failed: ${error}`)
      }
      if (result.synced.length > 0) {
        ctx.logger?.info?.(`dsh-liangshen: presets synced into ${targetRoot}: ${result.synced.join(', ')}`)
      }
      if (result.retired.length > 0) {
        ctx.logger?.info?.(`dsh-liangshen: retired stale presets from ${targetRoot}: ${result.retired.join(', ')}`)
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-liangshen: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let disposeSection: (() => void) | undefined
  const refresh = (): void => {
    disposeSection?.()
    disposeSection = undefined
    if (!resolve().enabled) return
    sync()
    if (resolve().announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-liangshen',
        order: SECTION_ORDER,
        text: LIANGSHEN_GUIDANCE,
      })
    }
  }

  // The web settings surface gets the plugin's enabled / announceToAgent
  // fields from this namespace; a settings edit re-runs refresh live, and
  // deployments without a settings service keep the composition entry.
  ctx.inject(['settings'], (settingsCtx) => {
    try {
      if (typeof settingsCtx.settings?.installSection === 'function') {
        settingsCtx.settings.installSection(ctx, LIANGSHEN_SETTINGS_NAMESPACE, Config, config ?? {}, {
          setSource: (source) => {
            current = source
            refresh()
          },
          onChange: refresh,
        })
      } else if (typeof settingsCtx.settings?.register === 'function') {
        const scope = settingsCtx.settings.register(LIANGSHEN_SETTINGS_NAMESPACE, Config, { base: config ?? {} })
        current = () => scope?.get?.() ?? (config ?? {})
        scope?.watch?.(() => { refresh() })
        refresh()
      }
    } catch {
      // Defensive fallback against settings registration differences
    }
  })

  refresh()
  ctx.effect(() => () => { disposeSection?.(); disposeSection = undefined }, 'dsh-liangshen: announcement')
}