# dsh-web-ui — 仓库规则

## 禁止使用 emoji

本仓库**禁止出现任何 emoji 字符**（含 Emoji_Presentation、变化选择符 U+FE0F、ZWJ 序列、
区域指示符、Dingbats/杂项符号等 Unicode Emoji 属性字符），覆盖所有文件类型：
代码、注释、README / 文档、UI 文案、脚本输出、提交信息均不得使用 emoji。

- 需要装饰性符号时，改用非 emoji 的普通字符（如 `×`、`-`、`*`），或直接去掉。
- 新提交前先检查：`git diff` 或全局搜索 Unicode Emoji 范围字符。

## 内测结束前禁止推送

**内测结束前一律不执行 `git push`**（无论是否被明确要求）。只允许本地 `git commit`；
远程仓库 `dsh-external/dsh-web-ui` 的推送需等内测结束、用户明确解除该限制后再进行。
若收到与推送相关的指令，先说明本规则再询问用户是否解除限制。
