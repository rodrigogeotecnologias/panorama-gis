$code = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public class FaithfulFittedStudio {
    public static readonly Color GlobeGreen = Color.FromArgb(255, 11, 131, 67);  // #0B8343
    public static readonly Color TechBlue   = Color.FromArgb(255, 0, 135, 209);  // #0087D1
    public static readonly Color PureWhite  = Color.FromArgb(255, 255, 255, 255);

    // 1. RENDER 2D EMBLEM (CIRCULO MAIOR ENCAIXADO ENTRE PARALELOS E CIRCULO MENOR DENTRO DO OLHO)
    public static Bitmap Render2DEmblem(int size) {
        Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);

            float cx = size * 0.50f;
            float cy = size * 0.50f;
            float R  = size * 0.485f;
            float lw = size * 0.038f;

            // Dimensions:
            // rMid = 270 (0.556 R): fits neatly between northern and southern parallels
            // pupilR = 98 (0.202 R): fits comfortably INSIDE the eye without colliding with eyelids
            float rMid   = R * 0.556f;
            float pupilR = R * 0.202f;

            using (SolidBrush greenBrush = new SolidBrush(GlobeGreen))
            using (SolidBrush blueBrush  = new SolidBrush(TechBlue))
            using (Pen whitePen = new Pen(PureWhite, lw)) {
                whitePen.StartCap = LineCap.Round;
                whitePen.EndCap   = LineCap.Round;
                whitePen.LineJoin = LineJoin.Round;

                // Circular silhouette clip
                using (GraphicsPath globeClip = new GraphicsPath()) {
                    globeClip.AddEllipse(cx - R, cy - R, R * 2, R * 2);
                    g.SetClip(globeClip);

                    // 1. Fill globe with green
                    g.FillEllipse(greenBrush, cx - R, cy - R, R * 2, R * 2);

                    // Geometry coordinates
                    float eyeCornerLeftX  = cx - R * 0.98f;
                    float eyeCornerRightX = cx + R * 0.98f;
                    float eyeApexY        = R * 0.285f;

                    // 2. Eye shape (Clean Blue fill for the entire eye interior)
                    using (GraphicsPath eyePath = new GraphicsPath()) {
                        eyePath.AddBezier(
                            new PointF(eyeCornerLeftX, cy),
                            new PointF(cx - R * 0.45f, cy - eyeApexY),
                            new PointF(cx + R * 0.45f, cy - eyeApexY),
                            new PointF(eyeCornerRightX, cy)
                        );
                        eyePath.AddBezier(
                            new PointF(eyeCornerRightX, cy),
                            new PointF(cx + R * 0.45f, cy + eyeApexY),
                            new PointF(cx - R * 0.45f, cy + eyeApexY),
                            new PointF(eyeCornerLeftX, cy)
                        );
                        eyePath.CloseFigure();
                        g.FillPath(blueBrush, eyePath);
                    }

                    // 3. WHITE GRID LINES

                    // 3.1 Central vertical meridian (penetrates seamlessly into eyelid stroke, eliminating gap/notch)
                    float eyelidCenterTop = cy - 0.75f * eyeApexY;
                    float eyelidCenterBot = cy + 0.75f * eyeApexY;
                    whitePen.StartCap = LineCap.Round;
                    whitePen.EndCap   = LineCap.Flat;
                    g.DrawLine(whitePen, cx, cy - R * 1.05f, cx, eyelidCenterTop + lw * 0.15f);

                    whitePen.StartCap = LineCap.Flat;
                    whitePen.EndCap   = LineCap.Round;
                    g.DrawLine(whitePen, cx, eyelidCenterBot - lw * 0.15f, cx, cy + R * 1.05f);

                    // Reset pen caps for subsequent elements
                    whitePen.StartCap = LineCap.Round;
                    whitePen.EndCap   = LineCap.Round;

                    // 3.2 Northern Parallel Line (Single arch curving UPWARD)
                    float parArch  = R * 0.170f;
                    float parBaseN = cy - R * 0.510f;
                    using (GraphicsPath parN = new GraphicsPath()) {
                        parN.AddBezier(
                            new PointF(cx - R * 1.10f, parBaseN + parArch),
                            new PointF(cx - R * 0.40f, parBaseN - parArch),
                            new PointF(cx + R * 0.40f, parBaseN - parArch),
                            new PointF(cx + R * 1.10f, parBaseN + parArch)
                        );
                        g.DrawPath(whitePen, parN);
                    }

                    // 3.3 Southern Parallel Line (Single arch curving DOWNWARD)
                    float parBaseS = cy + R * 0.510f;
                    using (GraphicsPath parS = new GraphicsPath()) {
                        parS.AddBezier(
                            new PointF(cx - R * 1.10f, parBaseS - parArch),
                            new PointF(cx - R * 0.40f, parBaseS + parArch),
                            new PointF(cx + R * 0.40f, parBaseS + parArch),
                            new PointF(cx + R * 1.10f, parBaseS - parArch)
                        );
                        g.DrawPath(whitePen, parS);
                    }

                    // 3.4 CIRCULO MAIOR INTERMEDIARIO (Encaixado perfeitamente entre os dois paralelos)
                    g.DrawEllipse(whitePen, cx - rMid, cy - rMid, rMid * 2, rMid * 2);

                    // 3.5 Eye Contours (Upper & Lower Eyelids)
                    using (GraphicsPath eyeOutline = new GraphicsPath()) {
                        eyeOutline.AddBezier(
                            new PointF(eyeCornerLeftX, cy),
                            new PointF(cx - R * 0.45f, cy - eyeApexY),
                            new PointF(cx + R * 0.45f, cy - eyeApexY),
                            new PointF(eyeCornerRightX, cy)
                        );
                        eyeOutline.AddBezier(
                            new PointF(eyeCornerRightX, cy),
                            new PointF(cx + R * 0.45f, cy + eyeApexY),
                            new PointF(cx - R * 0.45f, cy + eyeApexY),
                            new PointF(eyeCornerLeftX, cy)
                        );
                        g.DrawPath(whitePen, eyeOutline);
                    }

                    // 3.6 CIRCULO MENOR / PUPILA (Encaixado perfeitamente DENTRO do olho)
                    g.FillEllipse(blueBrush, cx - pupilR, cy - pupilR, pupilR * 2, pupilR * 2);
                    g.DrawEllipse(whitePen, cx - pupilR, cy - pupilR, pupilR * 2, pupilR * 2);

                    g.ResetClip();
                }
            }
        }
        return bmp;
    }

    // 2. RENDER 3D EMBLEM (SPHERICAL FORWARD BULGE + DIFFUSE & SPECULAR LIGHTING)
    public static Bitmap Render3DEmblem(Bitmap src2D) {
        int size = src2D.Width;
        float cx = size * 0.50f;
        float cy = size * 0.50f;
        float R  = size * 0.485f;

        Bitmap dst = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        int totalPixels = size * size;
        int[] srcPixels = new int[totalPixels];
        int[] dstPixels = new int[totalPixels];

        BitmapData srcData = src2D.LockBits(new Rectangle(0, 0, size, size), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(srcData.Scan0, srcPixels, 0, totalPixels);
        src2D.UnlockBits(srcData);

        // Bulge factor: 0.18 = subtle, elegant forward spherical bowing
        float bulgeK = 0.18f;

        // Key light direction from top-left (normalized)
        float lx = -0.38f;
        float ly = -0.42f;
        float lz = 0.82f;

        for (int y = 0; y < size; y++) {
            int rowOffset = y * size;

            for (int x = 0; x < size; x++) {
                int dIdx = rowOffset + x;
                float dx = x - cx;
                float dy = y - cy;
                float dist = (float)Math.Sqrt(dx * dx + dy * dy);

                if (dist > R + 2.5f) {
                    dstPixels[dIdx] = 0;
                    continue;
                }

                float normDist = dist / R;
                if (normDist > 1.0f) normDist = 1.0f;

                float z = (float)Math.Sqrt(Math.Max(0.0, 1.0 - normDist * normDist));

                float factor = 1.0f - bulgeK * z;
                float srcX = cx + dx * factor;
                float srcY = cy + dy * factor;

                int sx0 = (int)Math.Floor(srcX);
                int sy0 = (int)Math.Floor(srcY);
                int sx1 = Math.Min(size - 1, sx0 + 1);
                int sy1 = Math.Min(size - 1, sy0 + 1);
                float fx = srcX - sx0;
                float fy = srcY - sy0;

                if (sx0 < 0 || sy0 < 0 || sx0 >= size || sy0 >= size) {
                    dstPixels[dIdx] = 0;
                    continue;
                }

                int c00 = srcPixels[sy0 * size + sx0];
                int c10 = srcPixels[sy0 * size + sx1];
                int c01 = srcPixels[sy1 * size + sx0];
                int c11 = srcPixels[sy1 * size + sx1];

                float a00 = (c00 >> 24) & 0xFF; float r00 = (c00 >> 16) & 0xFF; float g00 = (c00 >> 8) & 0xFF; float b00 = c00 & 0xFF;
                float a10 = (c10 >> 24) & 0xFF; float r10 = (c10 >> 16) & 0xFF; float g10 = (c10 >> 8) & 0xFF; float b10 = c10 & 0xFF;
                float a01 = (c01 >> 24) & 0xFF; float r01 = (c01 >> 16) & 0xFF; float g01 = (c01 >> 8) & 0xFF; float b01 = c01 & 0xFF;
                float a11 = (c11 >> 24) & 0xFF; float r11 = (c11 >> 16) & 0xFF; float g11 = (c11 >> 8) & 0xFF; float b11 = c11 & 0xFF;

                float b = (b00 * (1 - fx) + b10 * fx) * (1 - fy) + (b01 * (1 - fx) + b11 * fx) * fy;
                float g = (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy;
                float r = (r00 * (1 - fx) + r10 * fx) * (1 - fy) + (r01 * (1 - fx) + r11 * fx) * fy;
                float a = (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;

                if (a < 5) {
                    dstPixels[dIdx] = 0;
                    continue;
                }

                float nx = dx / R;
                float ny = dy / R;
                float nz = z;

                float dot = nx * lx + ny * ly + nz * lz;
                float diffuse = Math.Max(0.0f, dot);

                float rz = 2.0f * dot * nz - lz;
                float spec = (float)Math.Pow(Math.Max(0.0, rz), 20) * 0.38f;

                float rimDarkness = 0.82f + 0.18f * (float)Math.Pow(z, 0.40);
                float lightScale = (0.82f + 0.28f * diffuse) * rimDarkness;

                int finalB = (int)Math.Min(255.0f, b * lightScale + spec * 255.0f);
                int finalG = (int)Math.Min(255.0f, g * lightScale + spec * 255.0f);
                int finalR = (int)Math.Min(255.0f, r * lightScale + spec * 255.0f);
                int finalA = (int)Math.Min(255.0f, a);

                dstPixels[dIdx] = (finalA << 24) | (finalR << 16) | (finalG << 8) | finalB;
            }
        }

        BitmapData dstData = dst.LockBits(new Rectangle(0, 0, size, size), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(dstPixels, 0, dstData.Scan0, totalPixels);
        dst.UnlockBits(dstData);

        // Soft radial specular dome glow
        using (Graphics g = Graphics.FromImage(dst)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath domePath = new GraphicsPath()) {
                domePath.AddEllipse(cx - R, cy - R, R * 2, R * 2);
                using (PathGradientBrush pgb = new PathGradientBrush(domePath)) {
                    pgb.CenterPoint = new PointF(cx - R * 0.32f, cy - R * 0.35f);
                    pgb.CenterColor = Color.FromArgb(65, 255, 255, 255);
                    pgb.SurroundColors = new Color[] { Color.FromArgb(0, 255, 255, 255) };
                    g.FillPath(pgb, domePath);
                }
            }
        }

        return dst;
    }

    // 3. RENDER HORIZONTAL FULL LOGO (1600x460 px WITH OFFICIAL TYPOGRAPHY)
    public static Bitmap RenderHorizontalLogo(Bitmap emblem, bool is3D) {
        int width = 1600;
        int height = 460;
        Bitmap full = new Bitmap(width, height, PixelFormat.Format32bppArgb);

        using (Graphics g = Graphics.FromImage(full)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);

            int emblemSize = 380;
            int emblemX = 40;
            int emblemY = (height - emblemSize) / 2;

            if (is3D) {
                using (SolidBrush shadowBrush = new SolidBrush(Color.FromArgb(50, 0, 0, 0))) {
                    g.FillEllipse(shadowBrush, emblemX + 10, emblemY + 18, emblemSize, emblemSize);
                }
            }

            g.DrawImage(emblem, new Rectangle(emblemX, emblemY, emblemSize, emblemSize));

            // Typography
            int textX = emblemX + emblemSize + 55;
            using (Font titleFont = new Font("Segoe UI", 84, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Font subFont   = new Font("Segoe UI", 26, FontStyle.Bold, GraphicsUnit.Pixel))
            using (SolidBrush whiteBrush = new SolidBrush(Color.White))
            using (SolidBrush greenBrush = new SolidBrush(GlobeGreen))
            using (SolidBrush grayBrush  = new SolidBrush(Color.FromArgb(255, 148, 163, 184))) {
                string part1 = "PANORAMA ";
                string part2 = "GIS";
                
                SizeF size1 = g.MeasureString(part1, titleFont);
                float titleY = 135;

                g.DrawString(part1, titleFont, whiteBrush, textX, titleY);
                g.DrawString(part2, titleFont, greenBrush, textX + size1.Width - 10, titleY);

                float subY = titleY + size1.Height - 5;
                g.DrawString("PLATAFORMA GEOESPACIAL INTELIGENTE", subFont, grayBrush, textX + 4, subY);
            }
        }
        return full;
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$brandDir = "$PSScriptRoot\..\assets\branding\teste"
$artDir   = 'C:\Users\rodrigo.vasconcelos\.gemini\antigravity\brain\5ed5b543-cb8d-411e-b049-dbce6a86b475'

Write-Output "1/4 Rendering 2D Ultra HD Emblem (1024x1024)..."
$emblem2D = [FaithfulFittedStudio]::Render2DEmblem(1024)
$path2DEmblem = Join-Path $brandDir "logo_minimalista_globo_hd_emblema.png"
$emblem2D.Save($path2DEmblem, [System.Drawing.Imaging.ImageFormat]::Png)
$emblem2D.Save((Join-Path $artDir "logo_minimalista_globo_hd_emblema.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$emblem2D.Save((Join-Path $brandDir "minimalista_hd.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 2D emblem."

Write-Output "2/4 Rendering 3D Bulge Emblem (1024x1024)..."
$emblem3D = [FaithfulFittedStudio]::Render3DEmblem($emblem2D)
$path3DEmblem = Join-Path $brandDir "logo_minimalista_globo_3d_emblema.png"
$emblem3D.Save($path3DEmblem, [System.Drawing.Imaging.ImageFormat]::Png)
$emblem3D.Save((Join-Path $artDir "logo_minimalista_globo_3d_emblema.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 3D emblem."

Write-Output "3/4 Rendering 2D Full Horizontal Logo (1600x460)..."
$full2D = [FaithfulFittedStudio]::RenderHorizontalLogo($emblem2D, $false)
$path2DFull = Join-Path $brandDir "logo_minimalista_globo_hd_completa.png"
$full2D.Save($path2DFull, [System.Drawing.Imaging.ImageFormat]::Png)
$full2D.Save((Join-Path $artDir "logo_minimalista_globo_hd_completa.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 2D horizontal."

Write-Output "4/4 Rendering 3D Full Horizontal Logo (1600x460)..."
$full3D = [FaithfulFittedStudio]::RenderHorizontalLogo($emblem3D, $true)
$path3DFull = Join-Path $brandDir "logo_minimalista_globo_3d_completa.png"
$full3D.Save($path3DFull, [System.Drawing.Imaging.ImageFormat]::Png)
$full3D.Save((Join-Path $artDir "logo_minimalista_globo_3d_completa.png"), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 3D horizontal."

$emblem2D.Dispose()
$emblem3D.Dispose()
$full2D.Dispose()
$full3D.Dispose()

Write-Output "ALL 4 FAITHFUL RENDERINGS COMPLETED 100% SUCCESSFULLY!"
