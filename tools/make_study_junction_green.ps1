Add-Type -AssemblyName System.Drawing
$artDir = 'C:\Users\rodrigo.vasconcelos\.gemini\antigravity\brain\5ed5b543-cb8d-411e-b049-dbce6a86b475'

# Build a visual comparison card
$w = 1100
$h = 750
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 5, 8, 17))
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$fontTitle = New-Object System.Drawing.Font ("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$fontSub   = New-Object System.Drawing.Font ("Segoe UI", 11, [System.Drawing.FontStyle]::Regular)
$fontMono  = New-Object System.Drawing.Font ("Consolas", 10, [System.Drawing.FontStyle]::Bold)

$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$grayBrush  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 148, 163, 184))

# Title
$g.DrawString("Estudo de Melhoria: Conexão das Linhas + Contraste do Tom de Verde", $fontTitle, $whiteBrush, 30, 20)
$g.DrawString("1. Linhas verticais penetrando no traço da pálpebra (sem gap)  |  2. Amostras de verde extraídas do domo iluminado da logo 3D", $fontSub, $grayBrush, 30, 52)

# --- PANEL 1: Before vs After Junction (X: 30, Y: 90, W: 500, H: 620) ---
$cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$cardPen   = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 30, 41, 59), 1)
$g.FillRectangle($cardBrush, 30, 90, 500, 620)
$g.DrawRectangle($cardPen, 30, 90, 500, 620)

$g.DrawString("1. CORREÇÃO DA CONEXÃO DAS LINHAS", $fontTitle, $whiteBrush, 50, 110)
$g.DrawString("A linha vertical agora entra 6px no traço da pálpebra com cap plano, eliminando o entalhe.", $fontSub, $grayBrush, 50, 140)

# Load crop of user's print
$userImg = [System.Drawing.Bitmap]::FromFile((Join-Path $artDir "crop_top_exact.png"))
$g.DrawString("Antes (com gap / entalhe arredondado):", $fontSub, $whiteBrush, 50, 180)
$g.DrawImage($userImg, 50, 205, 190, 190)

# Load fixed junction crop
$fixedFull = [System.Drawing.Bitmap]::FromFile((Join-Path $artDir "test_junction_1000_perfect.png"))
$g.DrawString("Depois (Conexão 100% contínua e soldada):", $fontSub, [System.Drawing.Brushes]::LimeGreen, 270, 180)
# Crop around top junction (cx=500, y=396)
$fixedTopCrop = New-Object System.Drawing.Bitmap 190, 190
$gft = [System.Drawing.Graphics]::FromImage($fixedTopCrop)
$gft.DrawImage($fixedFull, (New-Object System.Drawing.Rectangle 0, 0, 190, 190), (New-Object System.Drawing.Rectangle 405, 301, 190, 190), [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($fixedTopCrop, 270, 205, 190, 190)

# Bottom junction
$g.DrawString("Junção Inferior Soldada (Depois):", $fontSub, [System.Drawing.Brushes]::LimeGreen, 50, 420)
$fixedBotCrop = New-Object System.Drawing.Bitmap 190, 190
$gfb = [System.Drawing.Graphics]::FromImage($fixedBotCrop)
$gfb.DrawImage($fixedFull, (New-Object System.Drawing.Rectangle 0, 0, 190, 190), (New-Object System.Drawing.Rectangle 405, 508, 190, 190), [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawImage($fixedBotCrop, 50, 445, 190, 190)

# Zoom view of the T-junction
$g.DrawString("Visão Geral do Olho Calibrado:", $fontSub, $whiteBrush, 270, 420)
$g.DrawImage($fixedFull, (New-Object System.Drawing.Rectangle 270, 445, 190, 190), (New-Object System.Drawing.Rectangle 300, 300, 400, 400), [System.Drawing.GraphicsUnit]::Pixel)

# --- PANEL 2: GREEN COLOR SWATCHES FROM 3D LOGO (X: 560, Y: 90, W: 510, H: 620) ---
$g.FillRectangle($cardBrush, 560, 90, 510, 620)
$g.DrawRectangle($cardPen, 560, 90, 510, 620)

$g.DrawString("2. TONS DE VERDE EXTRAÍDOS DA LOGO 3D", $fontTitle, $whiteBrush, 580, 110)
$g.DrawString("Pixels capturados diretamente da área iluminada do globo atual:", $fontSub, $grayBrush, 580, 140)

$colorsToTest = @(
    @{ Name = "Atual Base (Escuro)"; Hex = "#0B8343"; R=11; G=131; B=67; Desc = "Cor base vetorial, contraste mais baixo no tema escuro" },
    @{ Name = "Amostra 1 (Iluminado Médio)"; Hex = "#1D8C51"; R=29; G=140; B=81; Desc = "Pixel do gradiente difuso (L=0.33) - 25% mais luminoso" },
    @{ Name = "Amostra 2 (Verde Esmeralda Vivo)"; Hex = "#228E55"; R=34; G=142; B=85; Desc = "Pixel da crista do globo (L=0.35) - Contraste executivo ideal" },
    @{ Name = "Amostra 3 (Iluminado Vibrante)"; Hex = "#2E9860"; R=46; G=152; B=96; Desc = "Pixel de alta luminosidade (L=0.39) - Máximo destaque em botões" },
    @{ Name = "Destaque / Texto (Alto Contraste)"; Hex = "#49AD78"; R=73; G=173; B=120; Desc = "Pixel superior do domo (L=0.48) - Ideal para fontes e status" }
)

$yPos = 180
foreach ($c in $colorsToTest) {
    $swatchBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
    
    # Swatch box
    $g.FillRectangle($swatchBrush, 580, $yPos, 60, 60)
    $g.DrawRectangle([System.Drawing.Pens]::White, 580, $yPos, 60, 60)

    # UI Button Preview Mockup
    $btnRect = New-Object System.Drawing.Rectangle 660, $yPos, 140, 36
    $g.FillRectangle($swatchBrush, $btnRect)
    $btnText = "Entrar / Ação"
    $btnFont = New-Object System.Drawing.Font ("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $g.DrawString($btnText, $btnFont, $whiteBrush, 680, ($yPos + 8))

    # Badge Preview Mockup
    $badgeRect = New-Object System.Drawing.Rectangle 815, $yPos, 110, 24
    $badgeBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, $c.R, $c.G, $c.B))
    $badgeBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, $c.R, $c.G, $c.B), 1)
    $g.FillRectangle($badgeBg, $badgeRect)
    $g.DrawRectangle($badgeBorder, $badgeRect)
    $g.DrawString("0 Sobr. (Livre)", $fontMono, $swatchBrush, 820, ($yPos + 4))

    # Text
    $g.DrawString($c.Name + " - " + $c.Hex, $fontSub, $whiteBrush, 660, ($yPos + 42))
    $g.DrawString($c.Desc, $fontMono, $grayBrush, 580, ($yPos + 66))

    $swatchBrush.Dispose()
    $badgeBg.Dispose()
    $badgeBorder.Dispose()
    $btnFont.Dispose()
    $yPos += 88
}

$g.Dispose()
$cardBrush.Dispose()
$cardPen.Dispose()
$fontTitle.Dispose()
$fontSub.Dispose()
$fontMono.Dispose()
$whiteBrush.Dispose()
$grayBrush.Dispose()
$userImg.Dispose()
$fixedFull.Dispose()
$fixedTopCrop.Dispose()
$fixedBotCrop.Dispose()

$outComp = Join-Path $artDir "estudo_conexao_e_tons_verde.png"
$bmp.Save($outComp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host ("Comparison study generated: " + $outComp)
