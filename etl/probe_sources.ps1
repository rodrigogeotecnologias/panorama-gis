# Sondagem das fontes oficiais (somente leitura, nao altera nada).
# Para cada camada: conta feicoes (resultType=hits), testa export SHAPE-ZIP via WFS e URLs de download em massa.
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ua = 'Mozilla/5.0 (PanoramaGIS ETL probe)'
$out = New-Object System.Collections.ArrayList
function Log($s) { Write-Host $s; [void]$out.Add($s) }

$wfs = @(
  @{ n='UC (CNUC)';       url='https://geoservicos.inde.gov.br/geoserver/MMA/ows';        t='MMA:cnuc_26_07_31' },
  @{ n='CANIE';           url='https://geoservicos.inde.gov.br/geoserver/ICMBio/ows';     t='ICMBio:canie_052026_p' },
  @{ n='Embargos ICMBio'; url='https://geoservicos.inde.gov.br/geoserver/ICMBio/ows';     t='ICMBio:embargos_icmbio' },
  @{ n='Rodovias SNV';    url='https://geoservicos.inde.gov.br/geoserver/DNIT/ows';       t='DNIT:snv_202507a' },
  @{ n='Rodovias SRE (Estaduais)'; url='https://geoservicos.inde.gov.br/geoserver/DNIT/ows'; t='DNIT:cide_2024_25' },
  @{ n='Hidrografia';     url='https://geoservicos.ibge.gov.br/geoserver/ows';            t='CCAR:BC250_2023_Trecho_Drenagem_L' },
  @{ n='SIGEF';           url='https://geoportal.incra.gov.br/geoserver/ows';             t='geonode:sigef_geo' },
  @{ n='FUNAI TIs';       url='https://geoserver.funai.gov.br/geoserver/Funai/ows';       t='Funai:tis_poligonais' },
  @{ n='IPHAN pontos';    url='https://geoserver.iphan.gov.br/geoserver/SICG/ows';        t='SICG:sitios' },
  @{ n='IPHAN poligonos'; url='https://geoserver.iphan.gov.br/geoserver/SICG/ows';        t='SICG:sitios_pol' }
)

Log "=== 1) WFS: contagem de feicoes e teste de export SHAPE-ZIP ==="
foreach ($w in $wfs) {
  $cnt = 'ERRO'
  try {
    $u = "$($w.url)?service=WFS&version=1.1.0&request=GetFeature&typeName=$($w.t)&resultType=hits"
    $r = Invoke-WebRequest -Uri $u -UserAgent $ua -TimeoutSec 60 -UseBasicParsing
    if ($r.Content -match 'numberOfFeatures="(\d+)"') { $cnt = $Matches[1] } else { $cnt = 'sem numberOfFeatures' }
  } catch { $cnt = 'ERRO: ' + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)) }

  $zip = 'ERRO'
  try {
    $u2 = "$($w.url)?service=WFS&version=1.0.0&request=GetFeature&typeName=$($w.t)&outputFormat=SHAPE-ZIP&maxFeatures=5"
    $r2 = Invoke-WebRequest -Uri $u2 -UserAgent $ua -TimeoutSec 60 -UseBasicParsing
    $ct = $r2.Headers['Content-Type']
    $zip = "ok ($ct, $($r2.RawContentLength) bytes p/ 5 feicoes)"
  } catch { $zip = 'ERRO: ' + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)) }
  Log ("{0,-18} feicoes={1,-12} SHAPE-ZIP={2}" -f $w.n, $cnt, $zip)
}

Log ""
Log "=== 2) URLs de download em massa (HEAD/GET parcial) ==="
$bulk = @(
  'https://dados.mma.gov.br/dataset/unidades-de-conservacao',
  'https://certificacao.incra.gov.br/csv_shp/',
  'https://certificacao.incra.gov.br/csv_shp/export_shp.py',
  'https://geoftp.ibge.gov.br/cartas_e_mapas/bases_cartograficas_continuas/bc250/',
  'https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas',
  'https://www.gov.br/icmbio/pt-br/assuntos/geoprocessamento/mapas/dados-geoespaciais',
  'https://www.gov.br/transportes/pt-br/assuntos/dados-de-transportes/bit/mapas'
)
foreach ($b in $bulk) {
  try {
    $r = Invoke-WebRequest -Uri $b -UserAgent $ua -TimeoutSec 40 -UseBasicParsing -Method Get
    $links = @()
    if ($r.Links) { $links = $r.Links | Where-Object { $_.href -match '\.(zip|gpkg|shp|geojson|7z)(\?|$)' } | Select-Object -First 6 -ExpandProperty href }
    Log ("OK  {0} -> HTTP {1}, {2} bytes, links de dados: {3}" -f $b, $r.StatusCode, $r.RawContentLength, ($links -join ' | '))
  } catch { Log ("ERR {0} -> {1}" -f $b, $_.Exception.Message.Substring(0, [Math]::Min(90, $_.Exception.Message.Length))) }
}

$path = Join-Path (Get-Location).Path 'etl_probe_report.txt'
[System.IO.File]::WriteAllText($path, ($out -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Log "relatorio: $path"
