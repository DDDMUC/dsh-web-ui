# Agent Note: release-notes mention 污染 release 页 Contributors 框

状态：已实施

## 问题

v0.3.14 的 release 页面出现了一个 Contributors 侧边栏框，把该 release 归属给 `@deepseek-ai`（组织账号、鲸鱼头像、链接 github.com/deepseek-ai）。用户发现后质疑是否解析出错。`v0.3.13..v0.3.14` 区间内没有任何提交涉及该账号：仓库 `/contributors` 接口、提交 author/committer 邮箱、`Co-authored-by` 尾注全部干净。真正的触发点：入库的双语 notes 里有裸 token `@deepseek-ai`（来自提交主题 "move @deepseek-ai cohort to 0.1.2-rc.1"），GitHub 会把 release 正文里的这类 token 渲染成组织 **@mention**，而 release 页会把被 mention 的账号列进侧边栏 "Contributors" 框。v0.3.11-v0.3.13 的正文没有 mention，所以没有这个框。

## 决策

- 转义入库文件 `docs/release-notes/v0.3.14.md` 中的该 token（两个视图都给 `@deepseek-ai` 加反引号），并用 `gh release edit` 校正线上正文；渲染结果变为 `<code>@deepseek-ai</code>`，mention 计数归零，侧边栏框消失。
- 加固兜底路径：`scripts/release-notes.mjs` 渲染 bullet 时把 `@token` 序列（词边界后的字母、数字、点、斜杠、连字符）包进反引号，cohort/包名类提交主题从此无法把 mention 泄漏进生成的正文。
- 把规则写进 dsh-web-release skill：release notes 里绝不留裸 `@org` token；发布后抽查 release 页不再渲染 `user-mention`。

## 测试

- `scripts/release-notes.test.mjs` 新增两条 `bulletOf` 断言（`@deepseek-ai` 与 `@linxin666/dsh-web-all`），套件 8/8 通过。
- 编辑后实测 https://github.com/zhu1090093659/dsh-web/releases/tag/v0.3.14 ：无 Contributors 框、`user-mention` 计数 0、token 渲染为行内代码。

## 后果

- 今后的 notes 两条路径都安全：维护者手写文件遵守反引号规则，脚本草稿自动转义。
- release 页的账号归属由 mention 驱动，而不只由提交驱动；任何引用 scope 风格 token 的用户可见 markdown 面（尤其 release 正文）都需要同样处理。
