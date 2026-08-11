/**
 * Host loader entry for the task-board plugin.
 *
 * Everything the board does is browser work (DOM, localStorage, driving the
 * client runtime's session services over the wire), so the host half's only
 * behavior is a system-prompt section announcing the plugin to every agent.
 * The section registers while this plugin is in the host composition (mount /
 * DSH restart) and disappears when the plugin leaves it (unmount / restart),
 * so agents always know the board exists and how to cooperate with it.
 */

import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const inject = ['systemPrompt']

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TASK_BOARD_GUIDANCE = '本机已安装 dsh-task-board 插件（DSH Web GUI 的任务看板）：侧边栏「任务看板」入口；在 dsh-web-ui 插件全家桶仓库（packages/task-board）统一维护，经聚合包 web-ui-all 一键安装。能力：多列看板管理任务；任务可真实执行（驱动 agent 会话）；任务支持 5 段 cron 定时执行（如 0 23 * * *）；数据存浏览器 localStorage（键 dsh.taskBoard.v1）。限制：定时调度在浏览器端，需 GUI 标签页打开，错过即跳过；执行消耗 API 额度。用户提到「任务看板 / 看板 / 定时任务」时即指本插件，请据此协作。'

/**
 * Register the board's announcement section. The board itself is pure
 * browser work; this section is the only host-side contribution.
 * @param ctx - the plugin context (systemPrompt injected).
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'plugin:task-board',
    order: 200,
    text: TASK_BOARD_GUIDANCE,
  })
}
