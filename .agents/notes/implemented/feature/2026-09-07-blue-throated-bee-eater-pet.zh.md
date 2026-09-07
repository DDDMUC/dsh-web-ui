# Agent Note: 蓝喉蜂虎宠物收录

Status: implemented

## Problem

蓝喉蜂虎皮肤（湛蓝 #2b87d8 主色、青绿次级表面、栗红警告色、CC BY-SA 4.0 飞行照片背景）经 PR #1371 合入。与之配套的宠物贡献缺少现成素材：生态内每只宠物（whale-girl、ouo-neko、starry-doll、miku）都需要 8 列 × 9 行精灵图集（192×208 单元格，行序 idle / running-right / running-left / waving / jumping / failed / waiting / running / review，帧数 [6, 8, 8, 4, 5, 8, 6, 6, 6]）与逐轨道动画预览，而皮肤只有一张不适用于 9 态动画契约的飞行照片。

## Decision

新增内置 sprite2d 宠物 `blue-throated-bee-eater`（选择器名「蓝喉蜂虎」，author dsh-web，Apache-2.0），落在 `packages/dsh-pet/assets/blue-throated-bee-eater/`：

- **原创扁平插画素材**由 `docs/archive/blue-throated-bee-eater-pet/gen-pet.py` 程序化生成：Pillow Catmull-Rom 样条形状、4 倍超采样绘制，造型锚定蓝喉蜂虎（栗红羽冠、黑色过眼纹、湛蓝喉部、青绿体羽、湛蓝尾羽流、长弯黑喙），配色取自皮肤 token（#2b87d8 / #41a3e8 / #b26a3b / #0c2029 / #eef6f9）并为其羽毛补充专用青绿。
- **动画设计**：栖枝呼吸眨眼的待机、挥翼、昂首端详的 review、朝镜头悬停拍翅（`running` 轨道）、长翼拍动循环的 `running-right` / `running-left`（举翼 V 形呼应皮肤照片）、跳跃、垂头沮丧、歪头等待。
- 清单：petManifestVersion 2、9 行图集、按全局慢节奏基线声明的逐轨道时长、七个 ActivityPhase 全部映射 sequences、蜂虎专属妙语 remarks 块（pet / petCooldown / feed / feedCooldown / noTreats）。
- **分发**：按 CONTRIBUTING「随 PR 收录为内置宠物」随 npm 包内置（`files` 白名单增加条目，README 内置表与动画预览表中英双语更新），同时经 `scripts/market-build` 进入创意工坊目录（新增 market/dist/assets/pets 树与 pets.json 条目），用户亦可按需装入 `$DSH_HOME/pets/<id>`。
- 出处：生成器、contact sheet 与验证记录放在 `docs/archive/blue-throated-bee-eater-pet/`（不放进宠物目录，避免安装器把工具文件复制进 `$DSH_HOME/pets`）。

## Testing

`node scripts/dsh-pet validate` 通过 v2 契约、零诊断；registry 测试新增条目断言（id、displayName、图集几何、图集文件存在）且门禁全绿：dsh-pet build/test、typecheck、market:check、docs:check、i18n:check。

## Alternatives considered

- **照片抠图派生**：把 CC BY-SA 飞行照片里的鸟抠出来、按星夜人偶先例做纸偶变换动画。否决：绿色模糊背景上抠图缺少可靠的分割手段、单一滑翔姿态表现力有限、派生作品将承担 CC BY-SA 4.0 却视觉价值不高；原创矢量插画更清晰且版权归仓库。
- **frames2d 布局**：miku 式命名帧目录而非图集。否决：sprite2d 9 行契约与其他图集宠物及 README 预览表一致，陪伴型宠物不需要玩法块。
- **仅走创意工坊**：不打进 npm 包（星夜人偶先例）。否决：CONTRIBUTING 的宠物贡献条款把新宠物记为内置，且配套皮肤同样是纯资产包；内置成本仅约 140 KB。

## Consequences

dsh-pet 包资产体积增加（无损 webp 图集 + 九张 192×208 预览 GIF）；注册表条目列表新增排首位的 `blue-throated-bee-eater`（字母序），registry 测试已固定该顺序；创意工坊宠物清单新增 rank-1 条目，其预览顺序跟随 manifest tracks 键序（idle 居首）。生成器保持归档性质：确定性可重跑但不接入 CI，已提交资产为真值源。
