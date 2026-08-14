# dsh-web-ui — 仓库规则

DeepSeek Harness Web GUI 的插件与皮肤全家桶 monorepo。每个插件都是独立的
cordis bundle 包，经 `cordis.patch.yml` + profile 机制挂载到 `dsh web`，绝不修改
DSH 源码。改 `packages/` 前先读 [packages/AGENTS.md](packages/AGENTS.md)；写文档
先读 [docs/AGENTS.md](docs/AGENTS.md)。

## 仓库布局

```text
packages/
  dsh-<plugin>/       功能插件包（task-board / git-graph / ssh / pet / live-stats /
                      aionui-panel / remote-web-ui / web-ui-settings）
  dsh-skins/          皮肤聚合包：build.mjs 把 skins/* 皮肤资产收进一个 npm 包
  dsh-web-ui-all/     全家桶聚合包：aggregate.yml 汇总全部功能插件
  skins/<id>/         皮肤包（skin.json + lib/client.js，资产并入 dsh-skins）
shared/
  tsdown.client.ts    唯一共享构建预设（禁止在包内复制）
  web-platform.ts     客户端平台种子表（浏览器 bundle 纯度门）
scripts/              仓库维护脚本（聚合生成 / 链接 / 皮肤脚手架 / 校验）
docs/                 长期文档与归档（见 docs/AGENTS.md）
gallery/              皮肤画廊静态站（CI 校验与部署）
```

## 常用命令

```sh
pnpm install              # 安装依赖（NPM_TOKEN 见 docs/plugins.md 环境说明）
pnpm build                # 全仓构建（pnpm -r build）
pnpm test                 # 全仓单测
pnpm typecheck            # 全仓类型检查
pnpm test:scripts         # scripts/ 下 *.test.mjs 测试
pnpm aggregate:check      # 聚合包一致性（CI 门禁）
pnpm gallery:check        # 画廊产物一致性（CI 门禁）
pnpm skin-center:check    # 皮肤中心注册表一致性（CI 门禁）
pnpm docs:check           # 文档一致性（链接 / README / i18n 配对，CI 门禁）
node scripts/dsh-plugin-new <name>   # 脚手架：新插件包
node scripts/dsh-skin-new            # 脚手架：新皮肤包
```

改动提交前至少跑一遍 `pnpm typecheck && pnpm test && pnpm docs:check`（CI 会全量
跑所有门禁，见 [docs/development.md](docs/development.md)）。

## 全局约定

- **禁止修改 DSH 源码**：挂载只走 `cordis.patch.yml` + profile；tsconfig
  `extends` / `paths` / `references` 不得指向任何 DSH 源码 checkout；类型只来自
  `@deepseek-ai/*` 官方 NPM SDK（node_modules 解析），详见
  [packages/AGENTS.md](packages/AGENTS.md)。
- **新包一律 `dsh-` 前缀**；npm 包名 `@linxin666/dsh-*`（UI 类插件按惯例
  `@linxin666/dsh-client-ui-*`）。
- **构建预设只用 `shared/tsdown.client.ts`**，禁止在包内复制。
- **禁止使用 emoji**（含 Emoji_Presentation、U+FE0F、ZWJ、区域指示符、Dingbats 等
  Unicode Emoji 属性字符），覆盖代码、注释、文档、UI 文案、脚本输出与提交信息；
  需要装饰时用普通字符（`×`、`-`、`*`）或省略。CI 有全树检查。
- **认证环境**：`NPM_TOKEN` 只放环境变量；token 配置放用户级 `~/.npmrc`，
  项目 `.npmrc` 只留 scope 映射（详见 docs/plugins.md）。
- **双语纪律**：主插件包 README 中英配对（`README.md` + `README.zh.md` +
  `README.i18n.yaml`），皮肤包双语，规则见
  [docs/AGENTS.md](docs/AGENTS.md) 与 [docs/i18n.md](docs/i18n.md)。
- **文档随代码更新**：任何改动若触及 README / AGENTS.md / docs/ 描述的行为，
  必须同 PR 更新文档，否则 `pnpm docs:check` 变红。
- **一次性记录不进长期文档**：任务交接、验证快照归档到
  [docs/archive/](docs/archive/)，不混入长期文档目录。

## 分层指令体系（渐进式上下文）

| 文件 | 作用 |
| --- | --- |
| 本文件（根 AGENTS.md） | 仓库布局、命令、全局规则，每个会话都需要 |
| [packages/AGENTS.md](packages/AGENTS.md) | 包级规则：SDK 约束、bundle 形态、测试纪律 |
| [docs/AGENTS.md](docs/AGENTS.md) | 文档标准：结构分层、写作规则、i18n 配对、预算 |
| 各包 `AGENTS.md` | 该包特有规则（如 dsh-ssh 安全模型、dsh-skins 构建链） |

## 编辑这些指令

规则只在其归属层写一次，其他层引用链接，不重复展开。保持每条规则自包含（1-3
行），细节链接到归属文档。精简优于扩充；需要更多空间时提高
`scripts/doc-budgets.manifest.json` 中对应预算并在 PR 说明理由。
