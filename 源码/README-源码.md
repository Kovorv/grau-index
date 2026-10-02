# 源码与构建流水线（v1.4.2.1）

本目录是「ГРАУ / ГАУ 索引号总表 v1.4.2.1」交付包随附的**构建源码**。网页、CSV、xlsx 与原生程序
（GRAU索引系统v1.4.2.1.exe）都由这里的脚本从 `data` 里的 JSON 数据层重新生成。

## 目录

| 路径 | 内容 |
| --- | --- |
| `*.cjs` / `*.js` / `*.ps1` | 构建流水线（Node.js + PowerShell） |
| `native/` | 原生程序的 C# 源码（`Data.cs`／`MainForm.cs`／`Program.cs`）与 tsv 导出器 `exp_native.cjs` |
| `data/` | 数据层：`master.json`（条目主表）、`refs.json`、`parts/*.json`（措辞／别名／构成部件／弹药研究关系）、`biblio/references.json`（参考文献） |

## 构建顺序（`build_all.ps1` 自动执行）

1. `build_master.cjs` → 合并全部来源与组件／关系层，写出 `master.json`
2. `build_refs.cjs` → 生成「详查索引」的缩写／专名／单位／类型四张对照表
3. `nicks_apply.cjs` / `nicks_fix.cjs` → 合并中文译文（专名、说明）
4. `assemble_v1.cjs` → 拼出 `grau_index.html` 的 head + tail
5. `build_v1.cjs`（读 `build_v1_tail.cjs` 与 `v1_client.js`）→ 生成单页网页与 `grau_index.csv`
6. `build_xlsx.cjs` / `build_oth_csv.cjs` → 生成 xlsx 与「其他总局目录」四个附属 CSV
7. `embed_list.cjs` / `embed_resize.ps1` / `embed_build.cjs` → 把 `thumbs/` 缩略图内嵌成单文件网页
8. `native/exp_native.cjs` + `tsv_sections.cjs` → 把网页载荷导出成原生程序读的 `grau_data.tsv(.gz)`
9. `csc`（.NET Framework 4）→ 编译 `native/Data.cs` `native/MainForm.cs` `native/Program.cs`，
   内嵌 `grau_data.tsv.gz`、`img.bin`、`cover.jpg` 与图标

重编原生程序的完整命令（在 `源码/native` 目录下执行；`grau_data.tsv.gz` 与 `img.bin` 由第 8 步生成）：

```
csc.exe /nologo /target:winexe /platform:anycpu /optimize+ /win32icon:grau.ico /out:GRAU索引系统v1.4.2.1.exe /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /resource:grau_data.tsv.gz,grau_data.tsv.gz /resource:img.bin,img.bin /resource:cover.jpg,cover.jpg /resource:grau.ico,grau.ico Data.cs MainForm.cs Program.cs
```

发布前的收尾：`build_biblio.cjs`（参考文献层，读交付 CSV）→ `readme_v1421.cjs`（README 的版本段落）
→ `write_disclaimer.cjs`（免责声明）→ `pack_src.ps1`（本目录）→ 打包 zip。
`verify_links.cjs` 审计条目间的双向链接（悬空／单向、弹药覆盖率），`make_classprobe.cjs` + `getpre.cjs`
用 Edge 无头模式跑网页端回归。

## 运行环境

* Node.js ≥ 18（脚本只用标准库：`fs`／`path`／`zlib`）
* PowerShell 5.1（Windows 自带）
* .NET Framework 4 的 `csc.exe`（`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`）
* 可选：Microsoft Edge（无头模式跑网页探针）

## 随包发出的内容边界

* `data/` 含条目主表与关系层，足以重算网页、CSV、xlsx 与原生 tsv。
* **不含**：维基百科与网络图片缓存（`_raw/wiki`、`_raw/web`、`_raw/rwd`，合计数百 MB）、
  缩略图目录（交付目录里已有 `thumbs/`）、其它总局目录的原始 PDF／网页存档。
  这些属于外部抓取缓存，缺失时构建仍可完成，只是「卡片层」的维基摘录与配图会为空。
* 数据来源与免责声明见交付目录的 `README.md`、`参考文献.md` 与 `免责声明.txt`。

整理：@防空妖精哥特兰 · @Deepseek · 三陆问题研究中心。
