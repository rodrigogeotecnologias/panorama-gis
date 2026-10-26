Add-Type -AssemblyName System.Drawing

$brandDir = (Get-Item "$PSScriptRoot\..\assets\branding\teste").FullName
$artDir   = 'C:\Users\rodrigo.vasconcelos\.gemini\antigravity\brain\5ed5b543-cb8d-411e-b049-dbce6a86b475'

$origFile = Join-Path $brandDir "minimalista.png"
$hdFile   = Join-Path $brandDir "logo_minimalista_globo_hd_emblema.png"
$d3File   = Join-Path $brandDir "logo_minimalista_globo_3d_emblema.png"

$imgOrig = [System.Drawing.Bitmap]::FromFile($origFile)
$img2D   = [System.Drawing.Bitmap]::FromFile($hdFile)
$img3D   = [System.Drawing.Bitmap]::FromFile($d3File)

$boxW = 460
$boxH = 460
$pad = 30
$totalW = $pad * 4 + $boxW * 3
$totalH = $boxH + 150

$bmp = New-Object System.Drawing.Bitmap $totalW, $totalH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 10, 15, 29))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$titleFont = New-Object System.Drawing.Font ("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$emeraldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 185, 129))
$cyanBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 189, 248))
$grayBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148, 163, 184))
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 41, 59), 2)

# Card 1: Original
$x1 = $pad
$yBox = 100
$g.FillRectangle($bgBrush, $x1, $yBox, $boxW, $boxH)
$g.DrawRectangle($borderPen, $x1, $yBox, $boxW, $boxH)
$g.DrawString("1. ORIGINAL (Baixa Resolução)", $titleFont, $grayBrush, $x1 + 10, 25)
$g.DrawString("151 x 150 px • Imagem enviada", $subFont, $grayBrush, $x1 + 10, 58)
$g.DrawImage($imgOrig, $x1 + 20, $yBox + 20, $boxW - 40, $boxH - 40)

# Card 2: 2D Ultra HD
$x2 = $pad * 2 + $boxW
$g.FillRectangle($bgBrush, $x2, $yBox, $boxW, $boxH)
$g.DrawRectangle($borderPen, $x2, $yBox, $boxW, $boxH)
$g.DrawString("2. 2D ULTRA HD (Recriação Exata)", $titleFont, $cyanBrush, $x2 + 10, 25)
$g.DrawString("1024 x 1024 px • Círculos Encaixados • Vetor Puro", $subFont, $cyanBrush, $x2 + 10, 58)
$g.DrawImage($img2D, $x2 + 20, $yBox + 20, $boxW - 40, $boxH - 40)

# Card 3: 3D Abaulada
$x3 = $pad * 3 + $boxW * 2
$g.FillRectangle($bgBrush, $x3, $yBox, $boxW, $boxH)
$g.DrawRectangle($borderPen, $x3, $yBox, $boxW, $boxH)
$g.DrawString("3. 3D ABAULADA (Efeito Domo)", $titleFont, $emeraldBrush, $x3 + 10, 25)
$g.DrawString("1024 x 1024 px • Curvatura Esférica + Iluminação", $subFont, $emeraldBrush, $x3 + 10, 58)
$g.DrawImage($img3D, $x3 + 20, $yBox + 20, $boxW - 40, $boxH - 40)

$g.Dispose()
$imgOrig.Dispose()
$img2D.Dispose()
$img3D.Dispose()

$outArt = Join-Path $artDir "comparativo_triplo_final.png"
$outBrand = Join-Path $brandDir "comparativo_triplo_final.png"

$bmp.Save($outArt, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($outBrand, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "Comparativo triplo gerado com sucesso em $outArt"
