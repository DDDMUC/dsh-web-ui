# maid-atelier - 深海女仆工坊

[English](README.md) | 中文

一款纯展示层的 DeepSeek Harness Web GUI 皮肤，提供双角色工坊背景、深海蓝装饰面板与响应式侧边栏插画。`apply()` 持有 `data-dsh-maid-atelier` 作用域及全部 DOM / CSSOM 写入，Cordis effect 销毁器会完整收回这些改动；皮肤不注入服务、不发事件，也不触达模型请求。

## 特性

- 亮色与暗色工坊背景，以及独立的双角色图层。
- 深海蓝、陶瓷白、长春花蓝和柔金组成的面板样式。
- 响应式侧边栏角色、装饰 chrome、favicon 与皮肤自有文字标识。
- 自适应的输入区与工作区布局，不依赖远程资源。
- 插画以 data URI 内嵌在 client bundle 中。

## 安装

安装皮肤聚合包后选择本皮肤：

```sh
dsh plugin --profile web add @linxin666/dsh-skins
dsh-skin use maid-atelier
```

从仓库开发时，应先构建本包，再重建皮肤中心与聚合资产。

## 素材与许可

本皮肤及内嵌素材采用 **CC BY-NC-SA 4.0**，仅限非商业使用。完整条款见 [LICENSE](LICENSE)；[NOTICE](NOTICE) 记录了鲸鱼娘角色衍生素材中上善、zipzip 与 Small-tailqwq 的署名链。

标题栏使用原创的 `MAID ATELIER` 文字样式，不嵌入 DeepSeek Harness BrandWordmark 矢量。独立上游项目为 [Small-tailqwq/dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale)。

## 开发

```sh
pnpm --filter @linxin666/dsh-client-ui-skin-maid-atelier build
pnpm --filter @linxin666/dsh-client-ui-skin-maid-atelier test
node scripts/skin-center-bundles
node scripts/gallery-build
pnpm --filter @linxin666/dsh-skins build
```

## 已知限制

- 即使通过聚合包安装，CC BY-NC-SA 4.0 的非商业限制仍然适用。
- 皮肤依赖当前 DSH Web 的侧边栏、工作区、输入区与标题栏 DOM 标记；不支持的 shell 布局会保留背景并省略无法定位的装饰。
- 大尺寸内嵌插画会增加 client bundle 体积。
