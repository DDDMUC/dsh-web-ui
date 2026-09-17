# remiel-starlit（蕾米埃尔·星翎）

[English](README.md) | 中文

米哈游《绝区零》角色同人主题：樱粉 / 冰蓝 / 夜靛半透明玻璃。浅色如晨雾羽光
（`calm` 场景），深色以紫红与靛黑承接夜靛舞台（`nocturne` 场景），
`--dsw-*` 调色板在亮 / 暗两态下完整重映射（static / alias / specific / aion）。

## 安装

皮肤中心是唯一的加载器：先装它（或装全家桶聚合包），再从
[创意工坊](https://dsh-market.com) 把本皮肤安装到 `$DSH_HOME/skins/remiel-starlit/`，
然后在「设置 → 皮肤」里试穿或应用。切换是原子的，无需重启。

## 构成

- `skin.json` — v2 清单：`contributes.stylesheet` / `patches` / `backgroundMedia`
  （light → `assets/remiel-calm.jpg`，dark → `assets/remiel-nocturne.jpg`，各带原有遮罩）
- `skin.css` — L1：基础色 + 全部 `--dsw-*` 调色板重映射（亮色 `:root`、暗色 `body[data-ds-dark-theme]`）
- `patches.css` — L3：滚动条 / 选区 / 链接 / focus、aion 右侧面板、git-graph 泳道、composer，以及
  `[role="dialog"]` 设置弹窗的方形专属背景（引用 `assets/remiel-settings-*.jpg`）
- `assets/` — 场景图与设置弹窗方图
- `NOTICE` — 角色版权与素材来源声明

本皮肤是纯声明式实现：不含 `hooks.mjs`，背景与弹窗全部经 `contributes` 与 CSS 承载。

## 预览

亮色（[preview/light.jpg](preview/light.jpg)）· 暗色（[preview/dark.jpg](preview/dark.jpg)）

## 版权

角色形象出自米哈游《绝区零》(Zenless Zone Zero)，著作权归米哈游所有；本皮肤为个人
非商业同人作品，素材与调色板由作者制作，按 CC BY-NC-SA 4.0 发布。详见 [NOTICE](NOTICE)。
