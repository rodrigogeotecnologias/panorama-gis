#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PANORAMA GIS â€” Pipeline de ETL Automatizado para Camadas Oficiais Federais
Executado semanalmente via GitHub Actions ou cron para alimentar o PostGIS (Supabase).
- Download automÃ¡tico das bases oficiais (WFS SHAPE-ZIP / FTP)
- ValidaÃ§Ã£o topolÃ³gica rigorosa (ST_MakeValid, remoÃ§Ã£o de vÃ©rtices duplicados)
- IngestÃ£o em tabelas _staging com substituiÃ§Ã£o atÃ´mica (zero downtime)
- AtualizaÃ§Ã£o da tabela de auditoria gov_layers_metadata
"""

import os
import sys
import zipfile
import subprocess
import shutil
import ssl
import time
import urllib.request
import urllib.parse
from datetime import datetime

INDE = "https://geoservicos.inde.gov.br/geoserver"

LAYERS = [
    {
        "key": "uc",
        "label": "Unidades de ConservaÃ§Ã£o",
        "agency": "MMA / CNUC",
        "table": "gov_uc",
        "url": f"{INDE}/MMA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=MMA:cnuc_26_07_31&outputFormat=shape-zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "canie",
        "label": "Cavidades Naturais (CANIE)",
        "agency": "ICMBio / CECAV",
        "table": "gov_canie",
        "url": f"{INDE}/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:canie_052026_p&outputFormat=shape-zip",
        "geom_type": "Point"
    },
    {
        "key": "embargos",
        "label": "Ãreas Embargadas",
        "agency": "ICMBio",
        "table": "gov_embargos",
        "url": f"{INDE}/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:embargos_icmbio&outputFormat=shape-zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "funai",
        "label": "Terras IndÃ­genas",
        "agency": "FUNAI",
        "table": "gov_funai",
        "url": "https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais&maxFeatures=1000&outputFormat=shape-zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "rodovias",
        "label": "Malha RodoviÃ¡ria Oficial (Federal)",
        "agency": "DNIT / SNV",
        "table": "gov_rodovias",
        "url": f"{INDE}/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:snv_202507a&outputFormat=shape-zip",
        "geom_type": "MultiLineString"
    },
    {
        "key": "rodovias_estaduais",
        "label": "Base RodoviÃ¡ria Estadual Unificada (SRE)",
        "agency": "DNIT / SRE / INDE",
        "table": "gov_rodovias_estaduais",
        "url": f"{INDE}/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:cide_2024_25&outputFormat=shape-zip",
        "geom_type": "MultiLineString"
    },
    {
        "key": "iphan",
        "label": "SÃ­tios ArqueolÃ³gicos (Pontos)",
        "agency": "IPHAN / SICG",
        "table": "gov_iphan",
        "url": "https://geoserver.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=SICG:sitios&outputFormat=shape-zip",
        "geom_type": "Point"
    },
    {
        "key": "iphan_pol",
        "label": "SÃ­tios ArqueolÃ³gicos (Poligonais)",
        "agency": "IPHAN / SICG",
        "table": "gov_iphan_poly",
        "url": "http://geoserver.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=SICG:sitios_pol&outputFormat=shape-zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "quilombolas",
        "label": "TerritÃ³rios Quilombolas",
        "agency": "INCRA / Acervo FundiÃ¡rio (Decreto nÂº 4.887/2003)",
        "table": "gov_quilombolas",
        "url": "https://certificacao.incra.gov.br/csv_shp/zip/%C3%81reas%20de%20Quilombolas.zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "assentamentos",
        "label": "Assentamentos da Reforma AgrÃ¡ria",
        "agency": "INCRA / Acervo FundiÃ¡rio (Lei nÂº 4.504/1964)",
        "table": "gov_assentamentos",
        "url": "https://certificacao.incra.gov.br/csv_shp/zip/Assentamento%20Brasil.zip",
        "geom_type": "MultiPolygon"
    },
    {
        "key": "sigef",
        "label": "ImÃ³veis Certificados (SIGEF)",
        "agency": "INCRA / SIGEF",
        "table": "gov_sigef",
        # SIGEF nacional (27 UFs, ~3,2 GB zipado) NÃƒO cabe no Supabase Free (500 MB).
        # SÃ³ Ã© carregado quando SIGEF_URL for definido (ex.: apÃ³s upgrade para Pro). AtÃ© lÃ¡ o app consulta ao vivo.
        "url": os.environ.get("SIGEF_URL", ""),
        "geom_type": "MultiPolygon",
        "optional": True
    },
    {
        "key": "hidrografia",
        "label": "Hidrografia e Drenagem",
        "agency": "IBGE / BC250",
        "table": "gov_hidrografia",
        "url": "https://geoftp.ibge.gov.br/cartas_e_mapas/bases_cartograficas_continuas/bc250/versao2023/shapefile/bc250_shapefile._2023_11_23.zip",
        "geom_type": "MultiLineString"
    },
    {
        "key": "embargos_ibama",
        "label": "Ãreas Embargadas (IBAMA)",
        "agency": "IBAMA / PAMGIA",
        "table": "gov_embargos_ibama",
        "url": "https://ftp-pamgia.ibama.gov.br/dados/adm_embargos_ibama_a.zip",
        "geom_type": "MultiPolygon"
    }
]

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def run_command(cmd, timeout=300):
    try:
        p = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout
        )
        if p.returncode != 0:
            log(f"ERRO no comando: {cmd}\nSaÃ­da: {p.stderr}")
            return False
        return True
    except subprocess.TimeoutExpired:
        log(f"ERRO: Comando expirou tempo limite de {timeout}s: {cmd}")
        return False
    except Exception as e:
        log(f"ERRO inesperado ao executar comando: {e}")
        return False

def test_db_connection(db_conn):
    log("Testando conectividade inicial com o banco de dados Supabase PostGIS...")
    try:
        p = subprocess.run(
            f'psql "{db_conn}" -c "SELECT PostGIS_Version();"',
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15
        )
        if p.returncode != 0:
            log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            log("FALHA CRÃTICA DE CONEXÃƒO COM O BANCO DE DADOS:")
            log(p.stderr)
            log("DICA: Certifique-se de usar o Connection Pooler IPv4 do Supabase:")
            log("postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres")
            log("O host direto (db.xxx.supabase.co) requer IPv6, incompatÃ­vel com GitHub Actions IPv4.")
            log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            return False
        log(f"ConexÃ£o com PostGIS confirmada com sucesso: {p.stdout.strip()}")
        return True
    except Exception as e:
        log(f"Erro ao testar conexÃ£o com o banco: {e}")
        return False

def download_file(url, out_path, max_retries=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "https://www.gov.br/"
    }
    # Cria contexto SSL flexÃ­vel para aceitar certificados governamentais (ex: ICP-Brasil da FUNAI)
    ctx = ssl._create_unverified_context()

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=45) as resp, open(out_path, "wb") as out:
                shutil.copyfileobj(resp, out)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
                return True
            else:
                log(f"Aviso: arquivo baixado vazio ou muito pequeno na tentativa {attempt}.")
        except Exception as e:
            log(f"Tentativa {attempt}/{max_retries} de download falhou para {url}: {e}")
            if attempt < max_retries:
                time.sleep(2)
    return False

def sync_layer(layer, db_connection_str, work_dir):
    key = layer["key"]
    table = layer["table"]
    staging_table = f"{table}_staging"
    zip_path = os.path.join(work_dir, f"{key}.zip")
    extract_dir = os.path.join(work_dir, key)

    log(f"--- Iniciando sincronizaÃ§Ã£o: {layer['label']} ({layer['agency']}) ---")
    
    # 1. Download
    try:
        log(f"Baixando pacote oficial de {layer['url']}...")
        ok = download_file(layer["url"], zip_path)
        if not ok:
            # Plano B: cÃ³pia de contingÃªncia versionada no repositÃ³rio (etl/fallback/<key>.zip)
            fb = os.path.join(os.path.dirname(__file__), "fallback", f"{key}.zip")
            if os.path.exists(fb):
                log(f"Fonte online indisponÃ­vel para {key}. Usando cÃ³pia de contingÃªncia do repositÃ³rio: {fb}")
                shutil.copyfile(fb, zip_path)
            else:
                log(f"Falha ao baixar arquivo ou tamanho insuficiente para {key}.")
                return False
    except Exception as e:
        log(f"ExceÃ§Ã£o durante download de {key}: {e}")
        return False

    # 2. DescompactaÃ§Ã£o
    os.makedirs(extract_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
    except Exception as e:
        log(f"Falha ao extrair ZIP de {key}: {e}")
        return False

    # Encontra o arquivo vetorial (.shp, .geojson, .json, .gpkg)
    vector_file = None
    for root, dirs, files in os.walk(extract_dir):
        for f in files:
            if f.lower().endswith((".shp", ".geojson", ".json", ".gpkg")):
                vector_file = os.path.join(root, f)
                break
        if vector_file:
            break

    if not vector_file:
        log(f"Nenhum arquivo vetorial (.shp/.geojson/.json/.gpkg) encontrado no pacote de {key}.")
        return False

    log(f"Arquivo vetorial localizado: {vector_file}")

    # 3. IngestÃ£o via ogr2ogr no PostGIS (em staging)
    # - ReprojeÃ§Ã£o automÃ¡tica para SIRGAS 2000 (EPSG:4674)
    # - SHAPE_ENCODING LATIN1: converte acentos dos DBFs governamentais para UTF-8
    # - OGR_EMPTY_DATE_AS_NULL: converte datas invÃ¡lidas (0000/00/00) em NULL
    # - PG_USE_COPY + -gt 65536: carga em lote (COPY), essencial com banco remoto (latÃªncia EUA -> SÃ£o Paulo).
    #   NÃƒO usar -skipfailures: ele forÃ§a 1 transaÃ§Ã£o por feiÃ§Ã£o e torna a carga ~1000x mais lenta.
    ogr_cmd = (
        f'ogr2ogr -f "PostgreSQL" "{db_connection_str}" "{vector_file}" '
        f'-nln "{staging_table}" -overwrite -t_srs EPSG:4674 -lco GEOMETRY_NAME=geom '
        f'-lco FID=id -lco SPATIAL_INDEX=GIST -nlt PROMOTE_TO_MULTI -gt 65536 '
        f'--config SHAPE_ENCODING LATIN1 --config OGR_EMPTY_DATE_AS_NULL YES --config PG_USE_COPY YES'
    )
    
    log(f"Ingerindo dados na tabela temporÃ¡ria {staging_table}...")
    if not run_command(ogr_cmd, timeout=2400):
        log(f"Falha na importaÃ§Ã£o ogr2ogr de {key}.")
        return False

    # 4. Troca AtÃ´mica de Tabelas e AtualizaÃ§Ã£o de Metadados via psql / PostGIS
    swap_sql = f"""
    BEGIN;
    -- Garante geometrias vÃ¡lidas
    UPDATE public.{staging_table} SET geom = ST_MakeValid(ST_RemoveRepeatedPoints(geom)) WHERE NOT ST_IsValid(geom);
    
    -- Troca atÃ´mica de tabelas
    DROP TABLE IF EXISTS public.{table}_old CASCADE;
    ALTER TABLE IF EXISTS public.{table} RENAME TO {table}_old;
    ALTER TABLE public.{staging_table} RENAME TO {table};
    DROP TABLE IF EXISTS public.{table}_old CASCADE;

    -- Garante permissÃµes de leitura pÃºblica e RLS na nova tabela
    GRANT SELECT ON public.{table} TO anon, authenticated;
    ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_select_{table} ON public.{table};
    CREATE POLICY p_select_{table} ON public.{table} FOR SELECT USING (true);

    -- Atualiza metadados
    INSERT INTO public.gov_layers_metadata (layer_key, layer_label, source_agency, last_sync_at, feature_count, sync_status, sync_message)
    VALUES ('{key}', '{layer["label"]}', '{layer["agency"]}', NOW(), (SELECT count(*) FROM public.{table}), 'ok', 'Sincronizado com sucesso via ETL')
    ON CONFLICT (layer_key) DO UPDATE SET
      last_sync_at = EXCLUDED.last_sync_at,
      feature_count = EXCLUDED.feature_count,
      sync_status = 'ok',
      sync_message = 'Sincronizado com sucesso via ETL';

    -- Garante permissÃµes na tabela de metadados
    GRANT SELECT ON public.gov_layers_metadata TO anon, authenticated;
    ALTER TABLE public.gov_layers_metadata ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_select_meta ON public.gov_layers_metadata;
    CREATE POLICY p_select_meta ON public.gov_layers_metadata FOR SELECT USING (true);

    COMMIT;
    """

    sql_path = os.path.join(work_dir, f"swap_{key}.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write(swap_sql)

    psql_cmd = f'psql "{db_connection_str}" -f "{sql_path}"'
    log(f"Executando transaÃ§Ã£o atÃ´mica de troca de tabela para {table}...")
    if not run_command(psql_cmd):
        log(f"Falha na transaÃ§Ã£o SQL de {key}.")
        return False

    log(f"SUCESSO: Camada {layer['label']} atualizada com sucesso no PostGIS!")
    return True

def main():
    db_conn = os.environ.get("SUPABASE_DB_URL")
    if not db_conn:
        log("ERRO: VariÃ¡vel de ambiente SUPABASE_DB_URL nÃ£o configurada.")
        log("Exemplo: postgresql://postgres.PROJECT_REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres")
        sys.exit(1)

    # 1. Teste de Sanidade de ConexÃ£o (Fail Fast em <15s sem esperar downloads)
    if not test_db_connection(db_conn):
        log("ABORTANDO: ConexÃ£o com o PostGIS nÃ£o pÃ´de ser estabelecida.")
        sys.exit(1)

    work_dir = os.path.join(os.path.dirname(__file__), "tmp_etl")
    os.makedirs(work_dir, exist_ok=True)

    active_layers = [l for l in LAYERS if not (l.get("optional") and not l.get("url"))]
    for l in LAYERS:
        if l not in active_layers:
            log(f"Camada {l['key']} ignorada (opcional, sem URL configurada).")

    success_count = 0
    for layer in active_layers:
        try:
            if sync_layer(layer, db_conn, work_dir):
                success_count += 1
        except Exception as e:
            log(f"Erro inesperado na camada {layer['key']}: {e}")

    log(f"ETL finalizado: {success_count}/{len(active_layers)} camadas sincronizadas com sucesso.")
    shutil.rmtree(work_dir, ignore_errors=True)

    if success_count == 0:
        log("ERRO FATAL: Nenhuma camada pÃ´de ser sincronizada com o banco.")
        sys.exit(1)
    elif success_count < len(active_layers):
        log(f"PARCIAL: {success_count} de {len(active_layers)} camadas foram sincronizadas no PostGIS. Algumas fontes externas apresentaram instabilidade temporÃ¡ria e serÃ£o reprocessadas no prÃ³ximo agendamento.")
    else:
        log("SUCESSO ABSOLUTO: Todas as camadas oficiais foram ingeridas no PostGIS com sucesso!")

if __name__ == "__main__":
    main()
