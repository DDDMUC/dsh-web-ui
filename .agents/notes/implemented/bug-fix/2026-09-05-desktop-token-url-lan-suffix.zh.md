# Agent Note：桌面端 token URL 行接受 LAN 后缀

状态：已实现 (implemented)

## 问题背景

Issue #1377：webserver 绑定非回环地址（例如用户 profile patch 写 `0.0.0.0`）时，
dsh 宿主会在 `dsh web: …` stdout 行尾追加 ` (LAN: http://<局域网IP>:<端口>/?token=…)`
后缀。桌面壳的 `parseTokenUrlLine` 用 `(\S+)$` 锚定行尾，带后缀的行永远匹配不上；
等待 5 秒宽限期后回退加载裸 URL，browser-auth 返回 401，窗口停留在
"dsh web authentication required" 黑屏。

## 决策

`desktop/src/runtime.cjs` 的 `TOKEN_URL_PATTERN` 把后缀改为可选
（`/^dsh web: (\S+)(?: \(LAN: \S+\))?$/`）。保留行锚定，只有完整的 URL 行才
匹配，截断的后缀行仍走裸 URL 回退路径。桌面窗口继续加载主（回环）URL；LAN
URL 仅为提示信息。

## 后果

非回环绑定时桌面壳能正常进入 GUI。与宿主无需重新协商格式：正则镜像
`@deepseek-ai/dsh-web-app` 的打印行为（`authenticatedUrl` 加可选 LAN 后缀）。

## 测试

desktop 包 `node --test`（15 项）：原有无后缀用例，以及新增两条断言——带后缀
行返回主 URL、截断后缀行返回 `undefined`。
