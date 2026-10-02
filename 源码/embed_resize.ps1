# Re-encode every referenced thumbnail into a small JPEG for inlining into the page.
#   powershell -File _raw\embed_resize.ps1
# Reads  _raw\embed_items.txt  (one thumbs/... reference per line)
# Writes _raw\embed512\<basename>.jpg   (KEYED BY FILE NAME, not by line number)
#        _raw\embed_fail.txt             (references that could not be decoded)
#
# NOTE: the cache used to be keyed by the line number in embed_items.txt.  When the
# reference list changed (the wiki re-sweep added ~370 pictures) every cached file
# shifted by one slot and the single-file page plus the native program started
# showing the wrong photo for each entry.  Name-keyed files cannot drift.
param(
  [string]$Root = $(if ($env:GRAU_DIR) { $env:GRAU_DIR } else { 'D:\DsHs\grau\grau_index.v1.4.2' }),
  [string]$Out  = 'D:\DsHs\grau\_raw\embed512',
  [int]$Max = 512,
  [int]$Quality = 72
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$items = Get-Content 'D:\DsHs\grau\_raw\embed_items.txt' -Encoding utf8 | Where-Object { $_.Trim() -ne '' }
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
$fail = New-Object System.Collections.Generic.List[string]
$done = 0
$sw = [System.Diagnostics.Stopwatch]::StartNew()
foreach ($it in $items) {
  $leaf = ($it -split '/')[-1]
  $name = [System.IO.Path]::GetFileNameWithoutExtension($leaf) + '.jpg'
  $src = Join-Path $Root ($it -replace '/', '\')
  $dst = Join-Path $Out $name
  if (Test-Path $dst) { $done++; continue }
  try {
    $img = [System.Drawing.Image]::FromFile($src)
    try {
      $sc = [Math]::Min(1.0, $Max / [Math]::Max($img.Width, $img.Height))
      $w = [int][Math]::Max(1, [Math]::Round($img.Width * $sc))
      $h = [int][Math]::Max(1, [Math]::Round($img.Height * $sc))
      $bmp = New-Object System.Drawing.Bitmap($w, $h)
      try {
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
          $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $g.Clear([System.Drawing.Color]::White)
          $g.DrawImage($img, 0, 0, $w, $h)
        } finally { $g.Dispose() }
        $bmp.Save($dst, $codec, $ep)
        $done++
      } finally { $bmp.Dispose() }
    } finally { $img.Dispose() }
  } catch {
    $fail.Add($it + ' :: ' + $_.Exception.Message) | Out-Null
  }
}
$ep.Dispose()
$fail | Set-Content 'D:\DsHs\grau\_raw\embed_fail.txt' -Encoding utf8
$sum = (Get-ChildItem $Out -Filter *.jpg | Measure-Object -Property Length -Sum).Sum
"root: $Root"
"re-encoded: $done / $($items.Count) | failed: $($fail.Count) | cache files: $((Get-ChildItem $Out -Filter *.jpg).Count) | $([math]::Round($sum/1MB,1)) MB | $([math]::Round($sw.Elapsed.TotalSeconds,1)) s"
