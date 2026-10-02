# 把构建流水线的源码与数据层复制进交付目录的「源码」子文件夹（交付要求：发出去的包必须带源码）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File D:\DsHs\grau\_raw\pack_src.ps1 -Target <交付目录> -Ver <版本>
param(
  [string]$Target = 'D:\DsHs\grau\grau_index.v1.4.2.1',
  [string]$Ver = '1.4.2.1',
  [switch]$NoData
)
$ErrorActionPreference = 'Stop'
$grau = 'D:\DsHs\grau'
$raw  = Join-Path $grau '_raw'
$src  = Join-Path $Target '源码'
$nat  = Join-Path $src 'native'
$dat  = Join-Path $src 'data'
New-Item -ItemType Directory -Force -Path $src, $nat, $dat | Out-Null

# 1) 构建流水线脚本（网页 / CSV / xlsx / 词典 / 原生导出 / 打包与验证）
$pipeline = @(
  'build_all.ps1', 'pack_src.ps1', 'rebuild_pass2.ps1',
  'build_master.cjs', 'build_refs.cjs', 'nicks_apply.cjs', 'nicks_fix.cjs', 'assemble_v1.cjs',
  'build_v1.cjs', 'build_v1_tail.cjs', 'v1_client.js', 'sys_classify.cjs',
  'translit_client.js', 'translit.cjs',
  'build_xlsx.cjs', 'build_oth_csv.cjs',
  'embed_list.cjs', 'embed_resize.ps1', 'embed_build.cjs', 'tsv_sections.cjs',
  'rel_scan.cjs', 'parts_build.cjs', 'parts_add_aliases.cjs',
  'build_biblio.cjs', 'readme_v1421.cjs', 'write_disclaimer.cjs',
  'verify_links.cjs', 'make_classprobe.cjs', 'getpre.cjs', 'peek_series.cjs', 'peek_idx.cjs', 'dump_classes.cjs'
)
# 2) 原生程序（C# 源码 + tsv 导出器）
$native = @('Data.cs', 'MainForm.cs', 'Program.cs', 'exp_native.cjs', 'mk_cover.ps1')
# 3) 数据层（条目的措辞／别名／关系／参考文献等 JSON；维基与图片缓存太大，不随包发出）
$data = @('master.json', 'refs.json') + (Get-ChildItem (Join-Path $raw 'parts') -File -Filter '*.json' |
  ForEach-Object { 'parts\' + $_.Name }) + @('biblio\references.json')

$missing = @()
foreach ($f in $pipeline) {
  $p = Join-Path $raw $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $src $f) -Force } else { $missing += $f }
}
foreach ($f in $native) {
  $p = Join-Path (Join-Path $raw 'native') $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $nat $f) -Force } else { $missing += ('native\' + $f) }
}
# 编译原生程序要用的资源（图标、封面）；img.bin 与 grau_data.tsv.gz 是构建产物，不随源码发出
foreach ($k in @('icon\grau.ico', 'native\cover.jpg')) {
  $p = Join-Path $raw $k
  $dst = Join-Path $nat (Split-Path $k -Leaf)
  if (Test-Path $p) { Copy-Item $p $dst -Force } else { $missing += $k }
}
if (-not $NoData) {
  foreach ($f in $data) {
    $p = Join-Path $raw $f
    if (!(Test-Path $p)) { $missing += $f; continue }
    $dst = Join-Path $dat $f
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    Copy-Item $p $dst -Force
  }
}

$readme = @"
# 源码与构建流水线（v$Ver）

本目录是「ГРАУ / ГАУ 索引号总表 v$Ver」交付包随附的**构建源码**。网页、CSV、xlsx 与原生程序
（GRAU索引系统v$Ver.exe）都由这里的脚本从 ``data`` 里的 JSON 数据层重新生成。

## 目录

| 路径 | 内容 |
| --- | --- |
| ``*.cjs`` / ``*.js`` / ``*.ps1`` | 构建流水线（Node.js + PowerShell） |
| ``native/`` | 原生程序的 C# 源码（``Data.cs``／``MainForm.cs``／``Program.cs``）与 tsv 导出器 ``exp_native.cjs`` |
| ``data/`` | 数据层：``master.json``（条目主表）、``refs.json``、``parts/*.json``（措辞／别名／构成部件／弹药研究关系）、``biblio/references.json``（参考文献） |

## 构建顺序（``build_all.ps1`` 自动执行）

1. ``build_master.cjs`` → 合并全部来源与组件／关系层，写出 ``master.json``
2. ``build_refs.cjs`` → 生成「详查索引」的缩写／专名／单位／类型四张对照表
3. ``nicks_apply.cjs`` / ``nicks_fix.cjs`` → 合并中文译文（专名、说明）
4. ``assemble_v1.cjs`` → 拼出 ``grau_index.html`` 的 head + tail
5. ``build_v1.cjs``（读 ``build_v1_tail.cjs`` 与 ``v1_client.js``）→ 生成单页网页与 ``grau_index.csv``
6. ``build_xlsx.cjs`` / ``build_oth_csv.cjs`` → 生成 xlsx 与「其他总局目录」四个附属 CSV
7. ``embed_list.cjs`` / ``embed_resize.ps1`` / ``embed_build.cjs`` → 把 ``thumbs/`` 缩略图内嵌成单文件网页
8. ``native/exp_native.cjs`` + ``tsv_sections.cjs`` → 把网页载荷导出成原生程序读的 ``grau_data.tsv(.gz)``
9. ``csc``（.NET Framework 4）→ 编译 ``native/Data.cs`` ``native/MainForm.cs`` ``native/Program.cs``，
   内嵌 ``grau_data.tsv.gz``、``img.bin``、``cover.jpg`` 与图标

重编原生程序的完整命令（在 ``源码/native`` 目录下执行；``grau_data.tsv.gz`` 与 ``img.bin`` 由第 8 步生成）：

``````
csc.exe /nologo /target:winexe /platform:anycpu /optimize+ /win32icon:grau.ico /out:GRAU索引系统v$Ver.exe /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /resource:grau_data.tsv.gz,grau_data.tsv.gz /resource:img.bin,img.bin /resource:cover.jpg,cover.jpg /resource:grau.ico,grau.ico Data.cs MainForm.cs Program.cs
``````

发布前的收尾：``build_biblio.cjs``（参考文献层，读交付 CSV）→ ``readme_v1421.cjs``（README 的版本段落）
→ ``write_disclaimer.cjs``（免责声明）→ ``pack_src.ps1``（本目录）→ 打包 zip。
``verify_links.cjs`` 审计条目间的双向链接（悬空／单向、弹药覆盖率），``make_classprobe.cjs`` + ``getpre.cjs``
用 Edge 无头模式跑网页端回归。

## 运行环境

* Node.js ≥ 18（脚本只用标准库：``fs``／``path``／``zlib``）
* PowerShell 5.1（Windows 自带）
* .NET Framework 4 的 ``csc.exe``（``%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe``）
* 可选：Microsoft Edge（无头模式跑网页探针）

## 随包发出的内容边界

* ``data/`` 含条目主表与关系层，足以重算网页、CSV、xlsx 与原生 tsv。
* **不含**：维基百科与网络图片缓存（``_raw/wiki``、``_raw/web``、``_raw/rwd``，合计数百 MB）、
  缩略图目录（交付目录里已有 ``thumbs/``）、其它总局目录的原始 PDF／网页存档。
  这些属于外部抓取缓存，缺失时构建仍可完成，只是「卡片层」的维基摘录与配图会为空。
* 数据来源与免责声明见交付目录的 ``README.md``、``参考文献.md`` 与 ``免责声明.txt``。

整理：@科夫罗夫机械（防空妖精哥特羊） · @Deepseek · 三陆问题研究中心。
"@
Set-Content -Path (Join-Path $src 'README-源码.md') -Value $readme -Encoding UTF8

$n = (Get-ChildItem $src -File -Recurse | Measure-Object Length -Sum)
Write-Host ("source package -> {0}" -f $src)
Write-Host ("files: {0} | bytes: {1:N0}" -f $n.Count, $n.Sum)
if ($missing.Count) { Write-Host ("MISSING (skipped): {0}" -f ($missing -join ', ')) -ForegroundColor Yellow }
