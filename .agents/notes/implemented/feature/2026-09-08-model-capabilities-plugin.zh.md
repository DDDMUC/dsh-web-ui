# Agent Note: 模型能力声明插件(dsh-model-capabilities)

状态: 已实现

## 问题背景

DSH 的自定义提供方(OpenAI 兼容网关等)在 Models 设置页只能填模型 ID、显示名称、上下文窗口与最大输出 token。未被内置目录覆盖的自定义模型因此丢失两类能力信息:

1. **模态**:`llm-pi-ai` 适配器在 `resolveModelInfo` 时读取 `models[].input` 决定是否放行图片附件(session controller 以 `MODEL_DOES_NOT_SUPPORT_IMAGES` 拒绝);自定义模型没有声明,永远无法发图。
2. **推理强度**:会话级 `reasoningEffort` 必须落在 `resolveCallConfig` 从模型 `reasoningEfforts` 字典物化的档位集合内,否则报 `UNSUPPORTED_REASONING_EFFORT`;自定义模型没有字典,选择器无从提供 low/high 等档位。

官方 `ProviderEditor` 源码注释明确写着 "There is deliberately no reasoning-effort control"——字段在 settings 文档里一直存在,缺的只是编辑入口;官方同时预留了 `settings.models.provider-card` keyed 插槽(entryKey = settingsNs)作为第三方扩展座位。

## 决策方案

新增 `packages/dsh-model-capabilities`(`@linxin666/dsh-client-ui-model-capabilities`,bundle 行 `ui-model-capabilities`):

1. **占位官方插槽**:client 半区向 `settings.models.provider-card` 注册 key `llm-pi-ai` 的 keyed entry,该家族每张已保存的提供方卡片获得可折叠「模型能力」扩展区。
2. **纯官方线路读写**:读取走 `remote.settings.describe()` 的 `llm-pi-ai` 视图(user 层优先,resolved 兜底展示);写入走 `remote.settings.mutate` 单条 set 操作,整体替换 `providers.<route>.models` 数组,携带读取时 revision 做防陈旧围栏,`settings/conflict` 时重读并提示重试。
3. **写入粒度为整数组**(关键约束):host 侧 `applyPathOp` 只下钻纯对象,路径遇到数组会整体替换——`models[i].input` 形式的下标寻址会把数组破坏成对象。条目为结构开放对象,未编辑字段(id/name/contextWindow/compat)经 `sanitizeEntry` 原样保留。
4. **编辑语义**:图片输入为显式声明(`["text","image"]` / `["text"]`,未声明态如实展示);推理为三态(不声明 / `false` 无推理 / 档位字典),档位 off–max 七档,每档带发送值(默认同名),一键填入 low/medium/high 常用预设,off 可留空表示「不发参数」。
5. **前置校验对齐适配器**:levels 模式必须含 off 以外档位、非 off 档位发送值非空,与 `dsh-llm-pi-ai` 的 `assertServiceable` 拒绝规则一致,编辑器先行拒绝。
6. **三语与登记**:zh/en 字典在包内(`model-caps` 命名空间),ru 集中在 dsh-i18n;i18n-audit 静态包表新增该包;聚合包 patchFrom/deps 登记并重新生成。

### 放弃的替代方案

- **自带 settings 命名空间存能力表、host 半区改写请求**:被否。会分裂事实源(settings.yaml 的 `input`/`reasoningEfforts` 才是适配器消费的事实),且 host 拦截层要处理竞态与双写一致性;官方文档注释明示 profile 字段就是给「知道路由的部署」留的。
- **视频/PDF 模态复选框(对齐参考设计图)**:被否。pi-ai 的模态词表只有 `text | image`,声明无法端到端生效,UI 就是欺骗。
- **host 半区暴露内置目录枚举**:v1 不做。内置目录路由没有用户 `models` 数组时显示指引(先在目录加行再声明),避免为枚举引入自定义 remote 面。

## 测试验证

- `tests/capabilities.spec.ts` 25 项:视图读取、模式分类、档位归一化、校验规则、草稿更新、op 构建。
- `tests/panel.spec.tsx` 7 项(jsdom + 假 remote face):挂载、整数组写入(带 revision 与未知字段保留)、三态切换、冲突重载、只读禁用、失败内联提示。测试曾抓出 `models` 少走一层的真实 bug。
- 门禁:`pnpm typecheck`、`pnpm test`(21 包)、`pnpm docs:check`、`pnpm i18n:check`(15 命名空间 zh/ru 各 1256 键)、`pnpm aggregate:check`、`pnpm test:scripts`(255 通过)全部通过;聚合 bundle 重建后含 `ui-model-capabilities` 行与本包 client 模块。
- 实机 GUI 验证依赖挂载与 DSH 重启,留给用户执行(见下)。

## 影响

自定义模型从此可以在 Models 页就地声明「能不能收图、支持哪些推理档位、每档发什么」:视觉模型能收图,推理档位出现在模型选择器并按声明拼写上线。deepseek 直连适配器不覆盖(其控制已存在);文本/图片之外模态不提供(词表所限)。

## 用户生效步骤

`dsh plugin --profile web add link:<repo>/packages/dsh-model-capabilities`(或更新 dsh-web-all 聚合安装)后**需重启 DSH 服务生效**;重启后打开 Web 设置的 Models 页即可看到各提供方卡片的「模型能力」扩展区。
