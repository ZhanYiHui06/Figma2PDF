# 技术验证报告（Spike）

日期：2026-10-19
样本：用户提供的测试文件《冶金机械 A4 中文版》，16 页 A4（595.276 × 841.89 pt），包含中文文字、近黑色文字与背景、满版照片、裁切图片。
运行环境：Node 22 + `@okathira/ghostpdl-wasm@1.1.0`（Ghostscript 10.06.0 编译的 WASM）、`pdf-lib@1.17.1`；Figma 一侧通过 Plugin API 实测。

## 结论速览

| # | 验证项 | 结论 |
|---|---|---|
| 1 | Figma PDF 中文文字可选中 | ✅ 可行 |
| 2 | Ghostscript WASM 做 RGB → CMYK（含图片）转换 | ✅ 可行 |
| 3 | 纯黑文字转单 K | ✅ 可行，但必须在 Figma 一侧做（见第 3 节） |
| 4 | 多页合并，写入 TrimBox / BleedBox，经过 gs 转换后保留 | ✅ 可行 |
| 5 | 方式 A 出血（Frame = 成品尺寸，导出 Frame 外 3mm 的内容） | ✅ 可行 |
| 6 | 性能 | ⚠️ 可接受，16 页大约 20 秒，需要进度条 |
| 7 | 双 CDN 加载 | ⚠️ jsDelivr 可用；国内 npmmirror 需要申请白名单 |
| 8 | 内置 ICC 的授权 | ❌ 未解决，是目前最大的风险 |
| 9 | 选区解析规则 | ⚠️ 真实文件结构推翻了原先的规则，需要修改 PRD |

## 1. Figma 导出的 PDF 长什么样

- 文字其实是**矢量轮廓**（Form XObject 里 3500 多条路径）。上面另外叠了一层**不可见的 Type 3 文字**（字形过程只有 `d1`，不绘制任何东西），这层带 ToUnicode，用来支持选中和复制。
  - 好处：印刷时**不存在缺字体、字体替换的问题**，中文也可以正常选中和复制。
  - 代价：Type 3 字体的 FontBBox 是 0，Acrobat 预检可能会报警告。这只是警告，不影响输出。
- 颜色空间：所有矢量颜色都是 `ICCBased sRGB` 下的 `r g b scn`，取值按 8 位量化（例如 0.125490 = 32/255）。
- 图片：**Figma 不会降采样**，PDF 里的像素尺寸等于原图尺寸。图片带有 SMask，也就是包含透明。
- 透明组：页面内容被包在一个 `/Group /Transparency` 的 Form 里。这意味着输出的 PDF 天然不符合 PDF/X-1a；目前定的 b 级不要求 PDF/X，所以不受影响。
- Figma 导出耗时：每页 0.07～1.2 秒。

## 2. CMYK 转换（Ghostscript WASM）

参数：`-sDEVICE=pdfwrite -sColorConversionStrategy=CMYK -sProcessColorModel=DeviceCMYK -sOutputICCProfile=<icc> --permit-file-read=<icc>`

- 输出中所有矢量颜色都变成 DeviceCMYK，图片也被转换成 CMYK JPEG。中文文字仍然可以选中。
- 转换前后的视觉对比见 `spike-compare.png`（左边是原始 RGB，右边是 CMYK 转换后再渲染），没有可见差异。
- 页面框 TrimBox / BleedBox 在 gs 处理后保留。
- 注意 1：`-dSAFER` 模式下必须加 `--permit-file-read` 才能读取外部 ICC 文件，否则会报错退出。
- 注意 2：转换颜色时 gs **会重新压缩 JPEG**。正式版需要显式设置高质量的压缩参数，或者对图片改用无损压缩，具体在 spec 里定。

## 3. 纯黑文字转单 K：在 PDF 层面做会出错

- 默认转换下，文字颜色 #202323 会变成 C72 M68 Y67 K88，油墨总量 295%，也就是四色黑，小字容易套印不准。
- 在 PDF 层面把近黑色重写成 `0 0 0 1 k`，这个值经过 gs 转换后能**原样保留**（已验证）。
- **但是这个样本里的封面背景和文字是同一个颜色 #202323。** PDF 里文字已经变成轮廓，和背景矩形没法区分。如果按颜色一刀切地转单 K，**整页背景都会变成单 K**，印出来是发灰的黑，没有四色黑那么深。
- **解决方案（已在 Figma 中验证）**：导出时先**克隆**一份 Frame，把克隆里的近黑色**文字**改成一个特殊的"标记色"（例如 rgb(1,2,3)/255），再导出 PDF；之后在 PDF 层把标记色替换成 `0 0 0 1 k`。原稿不会被修改，克隆在 `finally` 里删除。
  - 背景和大面积色块保持四色黑。v2 可以考虑提供"大面积黑色使用指定四色黑"的选项。
- 页面级那层不可见文字也会被转成四色黑。这不影响印刷，但实现时一并设成 K，避免预检工具误报。

## 4. 出血（方式 A）

做法：创建一个临时容器，大小为 Frame + 2 × 3mm，填充色取 Frame 的背景色；把克隆的 Frame 放进去，坐标偏移 3mm，并设置 `clipsContent=false`；然后导出这个容器。

- 实测导出结果的 MediaBox 是 612.28 × 858.90 pt，等于 A4 加上每边 3mm，结果正确。
- Frame 背景自动延伸到了出血区。Frame 外 3mm 以内原本被裁掉的内容（比如样本里一张宽 1191pt 的裁切图片）会在出血区显示出来，这正是出血该有的效果。
- 实测删除临时节点没有问题，但临时节点会进入撤销历史，需要在实现阶段确认是否会影响用户的撤销操作。

## 5. 性能与体积

- gs.wasm 原始体积 15.5MB，jsDelivr 用 brotli 传输后约 11MB。用户首次使用 CMYK 时需要下载。
- 16 页 A4 合并后做一次 gs 转换，在 Node 中耗时约 17 秒（单线程）。浏览器中预计差不多，需要实测。
- 结论：要有分阶段的进度条（导出 n/16 → 合并 → 转换），并且支持取消。

## 6. 双 CDN

| CDN | 结果 |
|---|---|
| jsDelivr | ✅ 200，`Access-Control-Allow-Origin: *`，`application/wasm`，brotli 压缩 |
| unpkg | ✅ 可作为第三备选 |
| npmmirror（国内） | ❌ 403：`"@okathira/ghostpdl-wasm" is not allow to unpkg files`。需要向 cnpm/unpkg-white-list 提交 PR，把**我们自己发布的包**加入白名单 |

- 计划：把 wasm 和 ICC 打包成我们自己的 npm 包发布，再申请国内白名单。
- 插件的 manifest 中，`networkAccess.allowedDomains` 要列出所有 CDN 域名。这些域名会公开显示在 Figma 社区的插件页面上。
- 所有加载的文件都要做 SHA-256 校验，校验不通过就拒绝执行。
- 明确不使用 BootCDN 和 staticfile，原因是它们在 2024 年发生过供应链事件。

## 7. ICC 授权（未解决）

- Japan Color 2001 Coated 由 Adobe 分发。Adobe 对"随软件捆绑分发"有单独的条款，我没有查到原文，**目前不能确认可以放进 AGPL 开源仓库**。
- ECI 的 FOGRA39 / ISO Coated v2：据 OpenICC 的资料，捆绑分发需要先获得 ECI 的单独许可。
- 目前确认可以随项目分发的，只有 Ghostscript 自带的 `default_cmyk.icc`（Artifex 的 SWOP 近似配置，AGPL 授权）。这次验证用的就是它。
- 候选方案：
  - (a) 联系 ECI 和 Japan Color 申请许可；
  - (b) 寻找授权宽松的 FOGRA39 兼容配置文件（例如 basICColor 发布的那一类，授权条款待核实）；
  - (c) 支持用户自行导入 ICC，并附上获取指南。

  (c) 无论如何都要做。

## 8. 选区解析：真实文件推翻了原规则

用户真实文件的结构是：

```
Section「V2 / 冶金机械 — A4 中文版」
  └─ Frame「中文版手册 — 16页」(横向 Auto Layout, 10484 × 842)
       ├─ Frame「01 — 封面」(A4)
       ├─ ...
       └─ Frame「16 — 封底」(A4)
```

按原规则"Section 展开它的直接子 Frame"，会得到**一个 10484pt 宽的单页**。另外，用户很可能直接选中「中文版手册 — 16页」这个容器 Frame，结果也是一样。

需要增加"容器 Frame 识别"规则，草案如下：
- 如果一个 Frame 的子节点**全部是 Frame**，并且（满足 Auto Layout，或者子 Frame 尺寸一致，或者自身尺寸不是任何纸张规格），就把它视为容器，继续向下展开。
- 在 UI 上提示"已将「中文版手册 — 16页」展开为 16 页"，并提供"作为单页导出"的切换。

## 9. 顺带发现：样本里的图片分辨率不足

| 页面 | 原图像素 | 放置方式 | 有效分辨率 |
|---|---|---|---|
| 01 封面 | 2400 × 1600 | 满版 FILL 595 × 842 | **137 ppi** |
| 03 公司简介 | 2600 × 1730 | 裁切 1191 × 285 | **157 ppi** |
| 15 品牌标语 | 2400 × 1600 | 满版 FILL | **137 ppi** |

这些图片都低于印刷常用的 300 ppi，这正好说明 DPI 预检的价值。另外，有效分辨率必须按 `scaleMode`（FILL / FIT / CROP / TILE）和实际变换来计算，不能只按宽度估算。

## 复现

```bash
cd spike && npm i
node run.mjs in.pdf out.pdf @default_cmyk.icc --permit-file-read=/default_cmyk.icc \
  -sColorConversionStrategy=CMYK -sProcessColorModel=DeviceCMYK -sOutputICCProfile=/default_cmyk.icc
python3 -I pdfcheck.py out.pdf      # 查看颜色操作符、图片色彩空间、页面框、文字
python3 -I blackk.py in.pdf k.pdf 0.2   # PDF 层的近黑色转单 K（仅用于验证，正式版改为在 Figma 侧用标记色）
node merge.mjs out.pdf 16 3 a.pdf b.pdf # 合并并写入 TrimBox/BleedBox
```
