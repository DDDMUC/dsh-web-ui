# dsh-web-ui — 仓库规则

## 插件只能基于官方 NPM SDK 开发（禁止改 DSH 源码）

- 本仓库所有插件**禁止修改 DeepSeek Harness (DSH) 源码**（对官方源码 checkout 零写入），
  挂载只走 `cordis.patch.yml` + profile 机制。
- 开发**只能基于官方 NPM SDK**：`@deepseek-ai/*` 内测私有包（scope registry 为
  registry.npmjs.org），类型来源是各包 `devDependencies` 中的 SDK 包（node_modules 解析）。
- **禁止** tsconfig `extends` / `paths` / `references` 指向任何 DSH 源码 checkout
  （`test-zhu1090093659`、`~/.dsh/source/current` 等引用一律不得新增）。
- 构建预设统一用仓库内单一共享副本 `shared/tsdown.client.ts`，禁止在包内复制。
- 环境：npm 私有 scope 需要 `NPM_TOKEN` 环境变量（项目 `.npmrc` 只写 `${NPM_TOKEN}`
  占位符，真实令牌只放环境变量，详见 `docs/plugins.md`）。

## 新包命名统一 dsh- 前缀

**此后新建的插件包（`packages/` 下新目录）一律以 `dsh-` 开头**（如 `dsh-aionui-panel`、
`dsh-task-board`）。既有包已全部更名对齐，新包直接沿用，不允许再出现不带 `dsh-` 前缀的
包目录。npm 包名沿用 `@deepseek-ai/dsh-*`（UI 类插件按惯例用 `@deepseek-ai/dsh-client-ui-*`）。

## 禁止使用 emoji

本仓库**禁止出现任何 emoji 字符**（含 Emoji_Presentation、变化选择符 U+FE0F、ZWJ 序列、
区域指示符、Dingbats/杂项符号等 Unicode Emoji 属性字符），覆盖所有文件类型：
代码、注释、README / 文档、UI 文案、脚本输出、提交信息均不得使用 emoji。

- 需要装饰性符号时，改用非 emoji 的普通字符（如 `×`、`-`、`*`），或直接去掉。
- 新提交前先检查：`git diff` 或全局搜索 Unicode Emoji 范围字符。

## 内测结束前禁止推送与 NPM 发布

**内测结束前一律不执行 `git push`**（无论是否被明确要求）。只允许本地 `git commit`；
远程仓库 `dsh-external/dsh-web-ui` 的推送需等内测结束、用户明确解除该限制后再进行。
若收到与推送相关的指令，先说明本规则再询问用户是否解除限制。

**内测结束前 NPM 包不得公开**：本仓库任何包（`@deepseek-ai/dsh-*`）禁止 `npm publish`
到公共 registry，禁止生成或分发对外可见的发布包/tarball。发布同样需等内测结束、
用户明确解除该限制后再进行。
