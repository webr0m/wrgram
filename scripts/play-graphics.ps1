param([string]$OutputDirectory = 'artifacts\play-store\alpha04')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

# Rasterize the existing Android brand paths, not a new mark or a fictional application screen.
function Draw-Brand($Graphics, [single]$X, [single]$Y, [single]$Size) {
    $state = $Graphics.Save()
    $Graphics.TranslateTransform($X,$Y)
    $Graphics.ScaleTransform(($Size/192),($Size/192))
    $shape = New-Object Drawing.Drawing2D.GraphicsPath
    $points = @(@(56,70),@(73,70),@(84,105),@(96,80),@(108,80),@(118,104),@(128,70),@(145,70),@(126,126),@(112,126),@(101,101),@(89,126),@(75,126))
    $polygon = [Drawing.PointF[]]@($points | ForEach-Object { New-Object Drawing.PointF([single]$_[0],[single]$_[1]) })
    $shape.AddPolygon($polygon)
    $gold = New-Object Drawing.Drawing2D.LinearGradientBrush([Drawing.PointF]::new(56,60),[Drawing.PointF]::new(145,135),[Drawing.ColorTranslator]::FromHtml('#FFE7A0'),[Drawing.ColorTranslator]::FromHtml('#B78128'))
    $Graphics.FillPath($gold,$shape)
    $spark = [Drawing.PointF[]]@(@(106,65),@(110,55),@(114,65),@(124,69),@(114,73),@(110,83),@(106,73),@(96,69) | ForEach-Object { New-Object Drawing.PointF([single]$_[0],[single]$_[1]) })
    $light = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#FFE9AF'))
    $Graphics.FillPolygon($light,$spark)
    $light.Dispose(); $gold.Dispose(); $shape.Dispose(); $Graphics.Restore($state)
}
function New-Canvas([int]$Width,[int]$Height) {
    $bitmap = New-Object Drawing.Bitmap($Width,$Height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bitmap.SetResolution(96,96)
    return $bitmap
}
$icon = New-Canvas 512 512
$g = [Drawing.Graphics]::FromImage($icon)
try {
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bg = New-Object Drawing.Drawing2D.LinearGradientBrush([Drawing.Point]::new(0,0),[Drawing.Point]::new(512,512),[Drawing.ColorTranslator]::FromHtml('#24262A'),[Drawing.ColorTranslator]::FromHtml('#0D0E10'))
    $g.FillRectangle($bg,0,0,512,512); $bg.Dispose()
    Draw-Brand $g 0 0 512
    $icon.Save((Join-Path $OutputDirectory 'icon-512.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally { $g.Dispose(); $icon.Dispose() }

$feature = New-Canvas 1024 500
$g = [Drawing.Graphics]::FromImage($feature)
try {
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $bg = New-Object Drawing.Drawing2D.LinearGradientBrush([Drawing.Point]::new(0,0),[Drawing.Point]::new(1024,500),[Drawing.ColorTranslator]::FromHtml('#202125'),[Drawing.ColorTranslator]::FromHtml('#0C0D0F'))
    $g.FillRectangle($bg,0,0,1024,500); $bg.Dispose()
    Draw-Brand $g -34 -6 480
    $gold = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#F0C65C'))
    $ink = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#F6F3ED'))
    $muted = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#B8B4AC'))
    $title = New-Object Drawing.Font('Segoe UI',54,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
    $sub = New-Object Drawing.Font('Segoe UI',27,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
    $small = New-Object Drawing.Font('Segoe UI',18,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
    $g.DrawString('WRGram',$title,$ink,430,124)
    $g.DrawString('Tu espacio, conectado.',$sub,$gold,432,210)
    $g.DrawString('Cliente no oficial de Telegram para Android',$small,$muted,433,278)
    $g.DrawString('ALPHA  |  Temas y notas locales',$small,$muted,433,322)
    $feature.Save((Join-Path $OutputDirectory 'feature-1024x500.png'),[Drawing.Imaging.ImageFormat]::Png)
    $gold.Dispose(); $ink.Dispose(); $muted.Dispose(); $title.Dispose(); $sub.Dispose(); $small.Dispose()
} finally { $g.Dispose(); $feature.Dispose() }
Get-ChildItem $OutputDirectory -File | Select-Object Name,Length
