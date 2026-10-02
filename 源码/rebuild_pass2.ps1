param(
  [string]$Target = 'D:\DsHs\grau\grau_index.v1.4.5',
  [string]$Work   = 'D:\DsHs\grau\_raw\work145',
  [string]$ExeName = 'GRAU索引系统v1.4.5.exe',
  [string]$Ver = '1.4.5',
  [string]$Parts = '128',
  [string]$Units = '48'
)
# v1.4.4 pass 2: rebuild page/csv/xlsx with the sorted series list, re-embed the single-file page
# and recompile the native program. The data pipeline (build_master/build_refs/nicks) is unchanged,
# so it is deliberately not re-run here.
$ErrorActionPreference = 'Stop'
$grau = 'D:\DsHs\grau'
Set-Location $grau
function Step($title, $block) {
  Write-Host "`n=== $title" -ForegroundColor Cyan
  & $block
  if ($LASTEXITCODE -ne 0) { throw "step failed: $title (exit $LASTEXITCODE)" }
}

$env:OUT_DIR = $Work
Step 'build_v1 (page)' { node _raw\build_v1.cjs }
$env:VER   = $Ver         # version string written into the xlsx 说明 sheet
$env:PARTS = $Parts       # optic+mech component rows (node _raw\parts_count.cjs)
$env:UNITS = $Units       # unit-layer rows (node _raw\units_count.cjs)
$env:XLSX_IN  = "$Work\grau_index.html"
$env:XLSX_OUT = "$Work\grau_index.xlsx"
Step 'build_xlsx' { node _raw\build_xlsx.cjs }

Copy-Item "$Work\grau_index.html" "$Target\grau_index.linked.html" -Force
Copy-Item "$Work\grau_index.csv"  "$Target\grau_index.csv" -Force
Copy-Item "$Work\grau_index.xlsx" "$Target\grau_index.xlsx" -Force
Write-Host 'copied page/csv/xlsx into the delivery directory'

$env:GRAU_DIR = $Target
Step 'embed_list'  { node _raw\embed_list.cjs }
Step 'embed_build' { node _raw\embed_build.cjs }

Push-Location "$grau\_raw\native"
try {
  Step 'exp_native'   { node exp_native.cjs }
  Step 'tsv_sections' { node "$grau\_raw\tsv_sections.cjs" }
} finally { Pop-Location }

Step 'csc' {
  Push-Location "$grau\_raw\native"
  try {
    # csc invoked from a non-ANSI console mangles a Unicode /out: path,
    # so compile to an ASCII name and move the result onto the Chinese delivery name.
    $tmp = Join-Path "$grau\_raw\native" '_native_build.exe'
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /platform:anycpu /optimize+ `
      /win32icon:D:\DsHs\grau\_raw\icon\grau.ico "/out:$tmp" `
      /reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
      /resource:grau_data.tsv.gz,grau_data.tsv.gz /resource:img.bin,img.bin /resource:cover.jpg,cover.jpg `
      /resource:D:\DsHs\grau\_raw\icon\grau.ico,grau.ico `
      Data.cs MainForm.cs Program.cs
    if ($LASTEXITCODE -ne 0) { throw "csc failed (exit $LASTEXITCODE)" }
    Move-Item $tmp (Join-Path $Target $ExeName) -Force
    Write-Host ("exe -> " + (Join-Path $Target $ExeName))
  } finally { Pop-Location }
}
Write-Host "`nDONE -> $Target" -ForegroundColor Green

