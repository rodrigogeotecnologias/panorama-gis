# ============================================================================
# PANORAMA GIS — Script de Verificação e Download Automatizado (PowerShell)
# ============================================================================
[CmdletBinding()]
param(
    [string]$OutputDir = "$PSScriptRoot\downloads"
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PANORAMA GIS - Download Automatizado de Bases Oficiais" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$Layers = @(
    @{ Name = 'UC_CNUC'; Url = 'https://geoservicos.inde.gov.br/geoserver/MMA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=MMA:cnuc_26_07_31&outputFormat=shape-zip' },
    @{ Name = 'CANIE_Cavernas'; Url = 'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:canie_052026_p&outputFormat=shape-zip' },
    @{ Name = 'Embargos_ICMBio'; Url = 'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:embargos_icmbio&outputFormat=shape-zip' },
    @{ Name = 'Rodovias_SNV'; Url = 'https://geoservicos.inde.gov.br/geoserver/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:snv_202507a&outputFormat=shape-zip' },
    @{ Name = 'Rodovias_Estaduais_SRE'; Url = 'https://geoservicos.inde.gov.br/geoserver/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:cide_2024_25&outputFormat=shape-zip' },
    @{ Name = 'IPHAN_Sitios'; Url = 'https://geoserver.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=SICG:sitios&outputFormat=shape-zip' },
    @{ Name = 'FUNAI_TIs'; Url = 'https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais&maxFeatures=1000&outputFormat=shape-zip' },
    @{ Name = 'Quilombolas_INCRA'; Url = 'https://certificacao.incra.gov.br/csv_shp/zip/%C3%81reas%20de%20Quilombolas.zip' },
    @{ Name = 'Assentamentos_INCRA'; Url = 'https://certificacao.incra.gov.br/csv_shp/zip/Assentamento%20Brasil.zip' },
    @{ Name = 'Embargos_IBAMA'; Url = 'https://ftp-pamgia.ibama.gov.br/dados/adm_embargos_ibama_a.zip' }
)

foreach ($l in $Layers) {
    $dest = Join-Path $OutputDir ($l.Name + '.zip')
    Write-Host ('Baixando ' + $l.Name + '... ') -NoNewline -ForegroundColor Yellow
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        Invoke-WebRequest -Uri $l.Url -OutFile $dest -TimeoutSec 180 -UserAgent 'Mozilla/5.0' -Headers @{ Referer = 'https://www.gov.br/' }
        $sw.Stop()
        $size = (Get-Item $dest).Length
        $kb = [Math]::Round($size / 1024, 1)
        $sec = [Math]::Round($sw.Elapsed.TotalSeconds, 1)
        Write-Host "OK ($kb KB em ${sec}s)" -ForegroundColor Green
    } catch {
        Write-Host "FALHA: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nDownloads concluidos na pasta: $OutputDir" -ForegroundColor Cyan
