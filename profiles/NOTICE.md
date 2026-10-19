# ICC 配置文件来源与许可

## 随插件提供（构建时内联进 `dist/ui.html`）

以下文件取自 [colord](https://github.com/hughsie/colord) 项目（Debian `colord-data` 1.4.8-3，`/usr/share/color/icc/colord/`），未做任何修改。

| 文件 | 描述 | SHA-256 | 许可 |
|---|---|---|---|
| `FOGRA39L_coated.icc` | FOGRA39L Coated | `19d6cd1de88bf48816a7d2bfea5b71e3fff65d09ba0bb4b26f58f76cb4840929` | CC0-1.0 |
| `FOGRA47L_uncoated.icc` | FOGRA47L Uncoated | `8315616e5b74fab2d70ce418c6b3e7d6aee29cea9ec96d790d1a1b9959164cba` | CC0-1.0 |
| `GRACoL_TR006_coated.icc` | GRACoL TR006 Coated | `4105c8d5e239846fd9a6b73216b4bd5a6eb3389ef55fc59ae2642154c975746b` | CC0-1.0 and NPES |
| `SWOP_TR005_coated_5.icc` | SWOP TR005 Coated (Grade 5) | `83cecb046506bb3ad976cd549ecc3b90598c0f15b7d3e8d2a4c987b3c723889a` | CC0-1.0 and NPES |

**CC0-1.0**（© 2012 Richard Hughes）：To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty. 全文见 <https://creativecommons.org/publicdomain/zero/1.0/>。

**NPES**（© 2007 NPES The Association for Suppliers of Printing, Publishing and Converting Technologies）：Profiles, or other derivative work, based on these data may be distributed with no further permissions from CGATS. However, this Technical Report must be identified as the source of the characterization data.

- GRACoL TR006 Coated 的表征数据来源：ANSI CGATS TR 006
- SWOP TR005 Coated 的表征数据来源：ANSI CGATS TR 005

## 用户选用时从 ICC 官方注册库下载（不随插件分发）

插件在用户选用时，直接从 <https://registry.color.org/profile-registry/profiles/> 下载原文件，并用 SHA-256 校验，不做修改，也不存放在本仓库或其他镜像中。

| 文件 | 版权方 | SHA-256 |
|---|---|---|
| `JapanColor2011Coated.icc` | JPMA / X-Rite | `73202ea802e57a63a0be05ed993fde8e4d51cc436120e6c47815ce785ff42916` |
| `PSOcoated_v3.icc` | ECI European Color Initiative | `c30ad2c01e8f93135ec7682c535e0a81bc2d177c301e196376c5f5838b5c8e86` |
| `GRACoL2013_CRPC6.icc` | IDEAlliance / X-Rite | `4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443` |

## 没有采用的

- **ECI ISO Coated v2**：文件里没有许可声明，Debian 2023 年因此把它移除。
- **ECI PSO Coated / Uncoated v3**：许可写明 "It may not be distributed … without written permission of ECI"，所以不能放进插件或镜像。
- **Adobe ICC Profiles（Bundling 版）**：允许随软件分发，但要求先让最终用户同意 Adobe EULA 或同等条款，还要为 Adobe 承担赔偿责任。同类标准已有上面的免费配置文件覆盖，所以没有采用。
