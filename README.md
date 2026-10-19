<img src="assets/icon-128.png" width="64" alt="Folio" />

# Folio（对开）

Figma 插件：把 Frame 导出为印刷级多页 PDF（RGB / CMYK·ICC、可视化排序、尺寸/出血/分辨率检查）。

- [PRD](docs/PRD.md) · [技术验证报告](docs/spike-report.md) · [手动测试清单](docs/test-checklist.md)

## 安装（开发版）

1. 下载或克隆本仓库（`dist/` 里是构建好的文件，不需要自己构建）。
2. Figma 桌面版 → 菜单 **Plugins → Development → Import plugin from manifest…**，选仓库根目录的 `manifest.json`。
3. 选中 Frame / Section，运行 **Plugins → Development → Folio 对开**。

> CMYK 导出第一次会在线下载色彩引擎（Ghostscript WASM，约 11MB，来自 jsDelivr，备用 unpkg），下载后做 SHA-256 校验。RGB 导出不联网。设计文件不会上传。

## 开发

```bash
npm ci
npm run watch      # 改代码自动重建 dist/
npm run check      # 类型检查 + 单元测试 + 构建
```

| 目录 | 内容 |
|---|---|
| `src/main/` | 插件主线程：读选区、做检查、克隆 Frame 导出 PDF（临时节点在 `finally` 里删除） |
| `src/ui/` | 界面（Preact），导出流程、Ghostscript Worker、ICC 管理 |
| `src/lib/` | 与 Figma 无关的纯逻辑：纸张匹配、选区解析、ppi、ICC 解析、PDF 处理、Ghostscript 调用 |
| `profiles/` | 随插件提供的 CMYK 配置文件（CC0），构建时压缩内联；来源与许可见 `profiles/NOTICE.md` |
| `test/` | Vitest 单元测试，包含一次真实的 Ghostscript WASM 转换 |
| `assets/` | 插件图标（来自原型的 logo/Folio 组件），上架社区时使用 |
| `spike/` | 技术验证脚本（非产品代码） |

改了 `src/` 之后请运行 `npm run build` 并一起提交 `dist/`，CI 会检查两者是否一致。

License: AGPL-3.0（随 Ghostscript）
