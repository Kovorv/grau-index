# Build the splash cover image for the native app.
# canvas 900x580: title block on top, 3x2 photo grid below
Add-Type -AssemblyName System.Drawing
$W = 900; $H = 580
$bmp = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.TextRenderingHint = 'ClearTypeGridFit'
$g.Clear([System.Drawing.Color]::FromArgb(20, 22, 26))

$border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(60, 66, 76), 1)
$pics = @('9К37.jpg', 'Т-90.jpg', '2С19.jpg', '6П20.png', '9К33.jpg', '9К38.jpg')
$cw = 292; $ch = 158; $gap = 8
$x0 = [int](($W - (3 * $cw + 2 * $gap)) / 2)
$y0 = 168
for ($i = 0; $i -lt $pics.Count; $i++) {
  $p = "D:\DsHs\grau\grau_index.v1.4.2.1\thumbs\" + $pics[$i]
  if (-not (Test-Path $p)) { continue }
  $col = $i % 3; $row = [int][math]::Floor($i / 3)
  $x = $x0 + $col * ($cw + $gap); $y = $y0 + $row * ($ch + $gap)
  $img = [System.Drawing.Image]::FromFile($p)
  $s = [math]::Max($cw / $img.Width, $ch / $img.Height)
  $dw = [int]($img.Width * $s); $dh = [int]($img.Height * $s)
  $dx = $x - [int](($dw - $cw) / 2); $dy = $y - [int](($dh - $ch) / 2)
  $clip = [System.Drawing.Rectangle]::new($x, $y, $cw, $ch)
  $g.SetClip($clip)
  $g.DrawImage($img, $dx, $dy, $dw, $dh)
  $g.ResetClip()
  $g.DrawRectangle($border, $x, $y, $cw - 1, $ch - 1)
  $img.Dispose()
}

$fTitle = [System.Drawing.Font]::new('Microsoft YaHei', 30, [System.Drawing.FontStyle]::Bold)
$fSub = [System.Drawing.Font]::new('Microsoft YaHei', 12)
$fBy = [System.Drawing.Font]::new('Microsoft YaHei', 10)
$fRu = [System.Drawing.Font]::new('Microsoft YaHei', 11)
$sf = [System.Drawing.StringFormat]::new()
$sf.Alignment = 'Center'
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 236, 242))
$dim = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150, 160, 172))
$acc = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(98, 170, 240))

$g.DrawString('ГРАУ / ГАУ 索引号总表', $fTitle, $brush, [System.Drawing.RectangleF]::new(0, 34, $W, 46), $sf)
$g.DrawString('Указатель индексов ГРАУ / ГАУ  ·  русско-китайский', $fRu, $dim, [System.Drawing.RectangleF]::new(0, 88, $W, 24), $sf)
$g.DrawString('11 799 条索引  ·  1 785 张图片  ·  23 类器材  ·  卡层含俄／英／中维基', $fSub, $brush, [System.Drawing.RectangleF]::new(0, 118, $W, 24), $sf)
$g.DrawString('整理：@科夫罗夫机械（防空妖精哥特羊）', $fBy, $acc, [System.Drawing.RectangleF]::new(0, 512, $W, 20), $sf)
$g.DrawString('正在载入数据…', $fBy, $dim, [System.Drawing.RectangleF]::new(0, 536, $W, 20), $sf)

$g.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ps = [System.Drawing.Imaging.EncoderParameters]::new(1)
$ps.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, 88)
$bmp.Save('D:\DsHs\grau\_raw\native\cover.jpg', $enc, $ps)
$bmp.Dispose()
"saved cover.jpg $((Get-Item 'D:\DsHs\grau\_raw\native\cover.jpg').Length) bytes"
