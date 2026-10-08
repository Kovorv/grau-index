param(
  [string]$Work = 'D:\DsHs\grau\_raw\work_current',   # intermediate build directory
  [string]$Target = 'D:\DsHs\grau\grau_index.v1.4.2.1', # delivery directory
  [string]$ExeName = 'GRAU索引系统v1.4.2.1.exe',
  [string]$ThumbsFrom = 'D:\DsHs\grau\grau_index.v1.4.2.1',   # previous delivery: source of thumbs/ and README.md
  [switch]$SkipZip
)
$ErrorActionPreference = 'Stop'
$grau = 'D:\DsHs\grau'
Set-Location $grau

function Step($title, $block) {
  Write-Host "`n=== $title" -ForegroundColor Cyan
  & $block
  if ($LASTEXITCODE -ne 0) { throw "step failed: $title (exit $LASTEXITCODE)" }
}

# 1. data pipeline (wording + references + Chinese nicknames)
Step 'build_master'   { node _raw\build_master.cjs }
Step 'build_refs'     { node _raw\build_refs.cjs }
Step 'nicks_apply'    { node _raw\nicks_apply.cjs --write }
Step 'nicks_fix'      { node _raw\nicks_fix.cjs --write }
Step 'assemble_v1'    { node _raw\assemble_v1.cjs }

# 2. page + csv + xlsx into the work directory
$env:OUT_DIR = $Work
Step 'build_v1 (page)' { node _raw\build_v1.cjs }
$env:XLSX_IN  = "$Work\grau_index.html"
$env:XLSX_OUT = "$Work\grau_index.xlsx"
Step 'build_xlsx'      { node _raw\build_xlsx.cjs }
Step 'build_oth_csv'   { node _raw\build_oth_csv.cjs $Work }

# 3. copy the fresh artefacts into the delivery directory
if (!(Test-Path $Target)) { New-Item -ItemType Directory -Path $Target | Out-Null }
Copy-Item "$Work\grau_index.html"       "$Target\grau_index.linked.html" -Force
Copy-Item "$Work\grau_index.csv"        "$Target\grau_index.csv" -Force
Copy-Item "$Work\grau_index.xlsx"       "$Target\grau_index.xlsx" -Force
foreach ($f in 'gbtu_objects.csv','engineering_items.csv','gau_56_57.csv','mo_index.csv') {
  if (Test-Path "$Work\$f") { Copy-Item "$Work\$f" "$Target\$f" -Force }
}
Write-Host 'copied page/csv/xlsx into the delivery directory'

# 3b. thumbnails + README come from the previous delivery folder (the page references thumbs/ by name)
if (!(Test-Path "$Target\thumbs")) {
  if (Test-Path "$ThumbsFrom\thumbs") {
    Copy-Item "$ThumbsFrom\thumbs" "$Target\thumbs" -Recurse -Force
    Write-Host ("thumbs copied from {0} ({1} files)" -f $ThumbsFrom, (Get-ChildItem "$Target\thumbs" -File).Count)
  } else { throw "no thumbnails found (looked in $ThumbsFrom\thumbs)" }
}
if (!(Test-Path "$Target\README.md") -and (Test-Path "$ThumbsFrom\README.md")) {
  Copy-Item "$ThumbsFrom\README.md" "$Target\README.md" -Force
  Write-Host 'README.md seeded from the previous delivery folder'
}

# 4. single-file page (thumbnails embedded)
$env:GRAU_DIR = $Target
Step 'embed_list'   { node _raw\embed_list.cjs }
# the thumbnail cache is keyed by file name and only re-encodes what is missing;
# skipping this step after the picture list changes used to leave stale pictures
# in both the single-file page and the native program
Step 'embed_resize' { & powershell -NoProfile -ExecutionPolicy Bypass -File "$grau\_raw\embed_resize.ps1" -Root $Target }
Step 'embed_build'  { node _raw\embed_build.cjs }

# 5. native data (run from _raw\native — the exporter resolves its paths relative to cwd)
Push-Location "$grau\_raw\native"
try {
  Step 'exp_native' { node exp_native.cjs }
  Step 'tsv_sections' { node "$grau\_raw\tsv_sections.cjs" }
} finally { Pop-Location }

# 6. compile the native program (sources and resources live in _raw\native)
Step 'csc' {
  Push-Location "$grau\_raw\native"
  try {
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /platform:anycpu /optimize+ `
      /win32icon:D:\DsHs\grau\_raw\icon\grau.ico "/out:$Target\$ExeName" `
      /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
      /resource:grau_data.tsv.gz,grau_data.tsv.gz /resource:img.bin,img.bin /resource:cover.jpg,cover.jpg `
      /resource:D:\DsHs\grau\_raw\icon\grau.ico,grau.ico `
      Data.cs MainForm.cs Program.cs
  } finally { Pop-Location }
}

# 7. zip
if (-not $SkipZip) {
  $zip = $Target + '.zip'
  Step 'zip' {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Compress-Archive -Path "$Target\*" -DestinationPath $zip -CompressionLevel Optimal
  }
  Write-Host ("zip: {0} bytes" -f (Get-Item $zip).Length)
}
Write-Host "`nDONE -> $Target" -ForegroundColor Green
