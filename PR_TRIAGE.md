# PR_TRIAGE — PR 分类与审批路由

本文件定义 dsh-web-ui 仓库 PR 的自动分类与审批路由机制：PR 打开后由
`.github/workflows/auto-assign-pr-reviewers.yml` 按变更文件与标题匹配分类，
自动请求对应审批者审查，与 [ISSUE_TRIAGE.md](ISSUE_TRIAGE.md) 中 Issue 的
自动分派对应。

## 路由配置

分类与审批者的映射在 `.github/pr-review-routes.json`：

| 字段 | 说明 |
| --- | --- |
| `routes[].name` | 分类唯一名，出现在路由日志与评论中 |
| `routes[].label` | 分类的中文展示名 |
| `routes[].paths` | 变更文件 glob 列表（`*` 不跨目录，`**` 跨目录），命中任一文件即匹配 |
| `routes[].title` | 标题正则（大小写不敏感），可选 |
| `routes[].reviewers` | GitHub 用户名列表，命中后请求这些用户审查 |

匹配规则：`paths` 命中与 `title` 命中取或；多个分类可同时命中，审查者
取并集；PR 作者本人会被过滤，draft PR 不触发。工作流从 base 分支读取配置
（PR 自身无法修改自己的路由），读取失败时跳过并记录警告。

## 当前路由

| name | 分类 | 审批者 |
| --- | --- | --- |
| `renderer` | 渲染器 / Wallpaper Engine / WebGL（`packages/skins/skin-center` 的 we-*、pkg-extract、wallpaper、backdrop-scene、WallpaperPanel 等） | Aa728848 |

新增分类：在 `routes` 追加条目并同步本表格；纯按标题路由可只写 `title`，
例如 `{"name": "community", "title": "^社区", "reviewers": ["zhu1090093659"]}`。

## 自动化行为

- 触发：`pull_request_target` 的 `opened` / `reopened` / `synchronize` /
  `ready_for_review`；
- 命中后调用 `pulls.requestReviewers` 请求审查，`opened` 时另发布一条
  分类路由说明评论；
- 无命中时不请求审查者，只记录日志。

## 维护者速查

```sh
# 手动请求审查
gh pr edit <n> -R zhu1090093659/dsh-web-ui --add-reviewer Aa728848

# 查看某 PR 的变更文件
gh api repos/zhu1090093659/dsh-web-ui/pulls/<n>/files --jq '.[].filename'
```
