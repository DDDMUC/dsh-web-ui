/**
 * Code-K-line UI copy. The zh dictionary rides the ths skin idiom
 * (红涨绿跌 / 标的 / 停牌 / 收盘); en keeps the market metaphor in English.
 */

/** Namespace under which this package's copy registers. */
export const NS = 'code-kline'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.loading': '加载中',
  'row.noMarket': '停牌',
  'row.net': '今日净 {n} 行',
  'row.close': '收盘 {n}',
  'panel.title': '代码行情',
  'panel.noGit': '无行情：非 git 仓库',
  'panel.noHistory': '无行情：窗口内无提交',
  'panel.scanError': '行情获取失败',
} satisfies Record<string, string>

/** The code-kline namespace key union. */
export type CodeKlineKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<CodeKlineKey, string> = {
  'row.loading': 'loading',
  'row.noMarket': 'N/A',
  'row.net': 'net {n} lines today',
  'row.close': 'close {n}',
  'panel.title': 'Code Quote',
  'panel.noGit': 'No quote: not a git repository',
  'panel.noHistory': 'No quote: no commits in window',
  'panel.scanError': 'Quote fetch failed',
}
