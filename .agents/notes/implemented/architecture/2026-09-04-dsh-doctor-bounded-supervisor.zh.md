# Agent Note: dsh-doctor supervisor runs as a host-bounded child

Status: implemented

解决[桌面版独立宿主笔记](../bug-fix/2026-09-03-desktop-separate-host-reserved-ports.zh.md)记录的未决发现：每次 dsh 宿主启动都会重新部署 dsh-doctor 的 OS 服务（带 KeepAlive 的 LaunchAgent / systemd unit / 计划任务），注册信息是全局状态，任何一次启动——dev 运行、e2e 自动化、打包应用——都会劫持它，而守护进程的生命周期超出一切进程清理的射程。桌面应用的前提是完全拥有自己的子进程，这让旧模式难以为继。

## Problem

Supervisor 此前被注册为登录级常驻守护：每次宿主启动执行 `service-install`，把平台服务定义写成当次启动自己的安装路径。注册从不区分来源：机器上任何一次 `dsh web` 启动都会重写它；launchd 让进程跨应用退出与进程组击杀存活（它属于 launchd，不属于我们）；KeepAlive 的 supervisor 还会带着已删除安装目录的路径继续运行。为桌面保留插件却禁用 web 侧，会把救助功能沿一条武断的线切开。

## Decision

Supervisor 保留全部能力——socket IPC + token、状态、巡查、自愈、恢复工作流、救援胶囊——只改变运行形态：

- 宿主的 ensure 将它拉起为宿主进程的受管子进程（非 detached、unref、`--parent-pid <宿主 pid>`）。`watchParentPid` 轮询 `kill(pid, 0)`，在拉起它的宿主消失时停止 supervisor——即使宿主非优雅退出也无法留下孤儿。新增 IPC `shutdown` 动作，让 ensure 能请退应答中的旧版本 supervisor，再拉起当前版本，不与其 socket 竞争。
- ensure 现在是：幂等清理遗留服务注册（携带旧注册的机器在首次启动时自动完成迁移）、无当前版本 supervisor 应答时拉起子进程、以及此前的胶囊刷新。心跳失败会重新踢动核对器，存活的其他宿主会接手拉起。
- `service-plan` / `service-install` CLI 动词移除；`service-uninstall` 保留为手动清理旧注册的入口；`agent/service.ts` 只渲染卸载计划。
- 接受的功能取舍：对「完全无法启动的宿主」自愈需要登录级常驻守望者。没有守护进程后，自愈发生在有宿主运行的时候；无法启动的场景仍可走 `dsh-doctor diagnose / repair` 手动路径。

## Alternatives considered

- 只在桌面 profile 种子中禁用 doctor：否决——会剥掉桌面的救助功能，web 侧守护依旧。
- 在宿主进程内运行 supervisor：否决——合并了崩溃域，且为 CLI 与控制台互操作仍需 socket。
- 保留 OS 服务但按桌面场景裁剪：否决——守护模式本身就是缺陷；按宿主子进程的形态在所有平台保持一致的进程语义（无 root/管理员、无登录持久化）。

## Consequences

不再写入任何全局服务定义：任何启动都无法劫持他人的注册，doctor 拉起的进程不再比宿主活得更久。并发宿主（CLI 实例 + 桌面实例）经 socket 共享同一个 supervisor；其拉起者退出后，下一个心跳失败会让其他宿主接手拉起。存量机器在新代码首次启动时自动完成迁移。

## Testing

393 个包测试通过：`agent-service` 围绕卸载计划重写（三个平台、容忍缺失注册与失败的注销命令），`host-ensure` 围绕 spawn/shutdown/遗留步骤重写（当前版本跳过、旧版本替换、SUPERVISOR_UNAVAILABLE、PROVISION_FAILED、并发合并），supervisor spec 覆盖 shutdown 动作与父进程监视。实机：以已死亡的 `--parent-pid` 启动 supervisor 立即退出；以存活父进程启动则正常应答 `status`，父进程死亡后一个轮询周期内退出。
