#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PANORAMA GIS — Pipeline de ETL Automatizado para Camadas Oficiais Federais
Executado semanalmente via GitHub Actions ou cron para alimentar o PostGIS (Supabase).
- Download automático das bases oficiais (WFS SHAPE-ZIP / FTP) com contingência local
- Validação topológica rigorosa (ST_MakeValid com preservação de tipo Multi*)
- Ingestão em tabelas _staging com substituição atômica (zero downtime)
- Atualização da tabela de auditoria gov_layers_metadata e função RPC analyze_project
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
        "label": "Unidades de Conservação",
        "agency": "MMA / CNUC",
        "table": "gov_uc",
        "url": f"{INDE}/MMA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=MMA:cnuc_26_07_31&outputFormat=shape-zip",
        "geom_type": "MultiPolygon",
        "select_fields": "cd_cnuc,nome_uc,categoria,grupo,esfera,uf,municipio,cria_ato,ha_total"
    },
    {
        "key": "canie",
        "label": "Cavidades Naturais (CANIE)",
        "agency": "ICMBio / CECAV",
        "table": "gov_canie",
        "url": f"{INDE}/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:canie_052026_p&outputFormat=shape-zip",
        "geom_type": "Point",
        "select_fields": "num_canie,nome,municipio,estado,nvl_valida"
    },
    {
        "key": "embargos",
        "label": "Áreas Embargadas (ICMBio)",
        "agency": "ICMBio",
        "table": "gov_embargos",
        "url": f"{INDE}/ICMBio/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ICMBio:embargos_icmbio&outputFormat=shape-zip",
        "geom_type": "MultiPolygon",
        "select_fields": "numero_ai,numero_emb,processo,tipo_infra,desc_inf_1,nome_uc,municipio,uf,area,ano"
    },
    {
        "key": "funai",
        "label": "Terras Indígenas",
        "agency": "FUNAI",
        "table": "gov_funai",
        "url": "https://geoserver.funai.gov.br/geoserver/Funai/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=Funai:tis_poligonais&maxFeatures=1000&outputFormat=shape-zip",
        "geom_type": "MultiPolygon",
        "select_fields": "terrai_cod,terrai_nom,etnia_nome,municipio_,uf_sigla,fase_ti,modalidade,superficie"
    },
    {
        "key": "rodovias",
        "label": "Malha Rodoviária Oficial (Federal)",
        "agency": "DNIT / SNV",
        "table": "gov_rodovias",
        "url": f"{INDE}/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:snv_202507a&outputFormat=shape-zip",
        "geom_type": "MultiLineString",
        "select_fields": "vl_br,sg_uf,nm_tipo_tr,ds_superfi,ds_jurisdi"
    },
    {
        "key": "rodovias_estaduais",
        "label": "Base Rodoviária Estadual Unificada (SRE)",
        "agency": "DNIT / SRE / INDE",
        "table": "gov_rodovias_estaduais",
        "url": f"{INDE}/DNIT/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=DNIT:cide_2024_25&outputFormat=shape-zip",
        "geom_type": "MultiLineString",
        "select_fields": "via,uf,tipo_trech,superficie,jurisdicao,cod_cide"
    },
    {
        "key": "iphan",
        "label": "Sítios Arqueológicos (Pontos)",
        "agency": "IPHAN / SICG",
        "table": "gov_iphan",
        "url": "https://geoserver.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=SICG:sitios&outputFormat=shape-zip",
        "geom_type": "Point",
        "select_fields": "co_iphan,identifica,ds_classif,ds_tipo_be,sintese_be"
    },
    {
        "key": "iphan_pol",
        "label": "Sítios Arqueológicos (Poligonais)",
        "agency": "IPHAN / SICG",
        "table": "gov_iphan_poly",
        "url": "http://geoserver.iphan.gov.br/geoserver/SICG/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=SICG:sitios_pol&outputFormat=shape-zip",
        "geom_type": "MultiPolygon",
        "select_fields": "co_iphan,identifica,ds_classif,ds_tipo_be,sintese_be"
    },
    {
        "key": "quilombolas",
        "label": "Territórios Quilombolas",
        "agency": "INCRA / Acervo Fundiário (Decreto nº 4.887/2003)",
        "table": "gov_quilombolas",
        "url": "https://certificacao.incra.gov.br/csv_shp/zip/%C3%81reas%20de%20Quilombolas.zip",
        "geom_type": "MultiPolygon",
        "select_fields": "cd_quilomb,nm_comunid,nm_municip,cd_uf,nr_process,fase,st_titulad,nr_familia,nr_area_ha,area_calc_,esfera,cd_sr"
    },
    {
        "key": "assentamentos",
        "label": "Assentamentos da Reforma Agrária",
        "agency": "INCRA / Acervo Fundiário (Lei nº 4.504/1964)",
        "table": "gov_assentamentos",
        "url": "https://certificacao.incra.gov.br/csv_shp/zip/Assentamento%20Brasil.zip",
        "geom_type": "MultiPolygon",
        "select_fields": "cd_sipra,nome_proje,municipio,uf,area_hecta,area_calc_,capacidade,num_famili,fase,sr"
    },
    {
        "key": "sigef",
        "label": "Imóveis Certificados (SIGEF)",
        "agency": "INCRA / SIGEF",
        "table": "gov_sigef",
        # SIGEF nacional (27 UFs, ~3,2 GB zipado) NÃO cabe no Supabase Free (500 MB).
        # Só é carregado quando SIGEF_URL for definido (ex.: após upgrade para Pro). Até lá o app consulta ao vivo.
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
        "geom_type": "MultiLineString",
        "shp_name": "hid_trecho_drenagem_l.shp",
        "select_fields": "nome,tipotrecho,regime,larguramed",
        "where": "nome IS NOT NULL" if os.environ.get("FREE_TIER_LIMIT", "").lower() == "true" else ""
    },
    {
        "key": "embargos_ibama",
        "label": "Áreas Embargadas (IBAMA)",
        "agency": "IBAMA / PAMGIA",
        "table": "gov_embargos_ibama",
        "url": "https://ftp-pamgia.ibama.gov.br/dados/adm_embargos_ibama_a.zip",
        "geom_type": "MultiPolygon",
        "encoding": "UTF-8",
        "select_fields": "num_tad,serie_tad,num_auto_i,nome_embar,municipio,uf,des_tad,qtd_area_e"
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
            log(f"ERRO no comando: {cmd}\nSaída STDERR: {p.stderr}\nSaída STDOUT: {p.stdout}")
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
            f'psql "{db_conn}" -v ON_ERROR_STOP=1 -c "SELECT PostGIS_Version();"',
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15
        )
        if p.returncode != 0:
            log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            log("FALHA CRÍTICA DE CONEXÃO COM O BANCO DE DADOS:")
            log(p.stderr)
            log("DICA: Certifique-se de usar o Connection Pooler IPv4 do Supabase:")
            log("postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres")
            log("O host direto (db.xxx.supabase.co) requer IPv6, incompatível com GitHub Actions IPv4.")
            log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            return False
        log(f"Conexão com PostGIS confirmada com sucesso: {p.stdout.strip()}")
        return True
    except Exception as e:
        log(f"Erro ao testar conexão com o banco: {e}")
        return False

def apply_schema_and_rpc(db_conn):
    schema_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "supabase", "gov_postgis_schema.sql"))
    if not os.path.exists(schema_path):
        log(f"Aviso: Arquivo de schema não encontrado em {schema_path}.")
        return False
    log("Aplicando/atualizando schema PostGIS e função RPC analyze_project...")
    cmd = f'psql "{db_conn}" -v ON_ERROR_STOP=1 -f "{schema_path}"'
    if run_command(cmd, timeout=60):
        log("Schema PostGIS e função RPC analyze_project atualizados com sucesso!")
        return True
    log("Aviso: Falha ao aplicar gov_postgis_schema.sql.")
    return False

def is_layer_fresh(layer, db_conn, work_dir):
    """
    Verifica se a camada já foi sincronizada com sucesso nas últimas 12 horas,
    possui registros válidos na tabela final e contém todas as colunas esperadas.
    Permite retomada rápida (idempotente) caso uma execução anterior tenha sido parcial.
    """
    if os.environ.get("FORCE_RESYNC", "").lower() == "true":
        return False
    key = layer["key"]
    table = layer["table"]
    staging_table = f"{table}_staging"
    req_cols = [c.strip().lower() for c in layer.get("select_fields", "").split(",") if c.strip()]
    cols_array = ",".join(f"'{c}'" for c in req_cols) if req_cols else "''"

    check_sql = f"""
    SELECT CASE WHEN
      EXISTS (
        SELECT 1 FROM public.gov_layers_metadata
        WHERE layer_key = '{key}'
          AND sync_status = 'ok'
          AND feature_count > 0
          AND last_sync_at > NOW() - INTERVAL '12 hours'
      )
      AND (SELECT count(*) FROM public.{table}) > 0
      AND (
        SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '{table}'
          AND column_name IN ({cols_array})
      ) = {len(req_cols)}
    THEN 'FRESH' ELSE 'STALE' END;
    """
    check_path = os.path.join(work_dir, f"check_{key}.sql")
    with open(check_path, "w", encoding="utf-8") as f:
        f.write(check_sql)
    try:
        p = subprocess.run(
            f'psql "{db_conn}" -t -A -f "{check_path}"',
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20
        )
        if p.returncode == 0 and "FRESH" in p.stdout:
            fix_sql = f"""
            DROP TABLE IF EXISTS public.{staging_table} CASCADE;
            DROP INDEX IF EXISTS public.{staging_table}_geom_geom_idx;
            CREATE INDEX IF NOT EXISTS idx_{table}_geom ON public.{table} USING GIST (geom);
            GRANT SELECT ON public.{table} TO anon, authenticated;
            ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS p_select_{table} ON public.{table};
            CREATE POLICY p_select_{table} ON public.{table} FOR SELECT USING (true);
            """
            fix_path = os.path.join(work_dir, f"fix_{key}.sql")
            with open(fix_path, "w", encoding="utf-8") as f:
                f.write(fix_sql)
            subprocess.run(f'psql "{db_conn}" -f "{fix_path}"', shell=True, capture_output=True, timeout=30)
            return True
    except Exception:
        pass
    return False

def download_file(url, out_path, max_retries=2):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "https://www.gov.br/"
    }
    ctx = ssl._create_unverified_context()

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=90) as resp, open(out_path, "wb") as out:
                shutil.copyfileobj(resp, out)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
                return True
            else:
                log(f"Aviso: arquivo baixado vazio ou muito pequeno na tentativa {attempt}.")
        except Exception as e:
            log(f"Tentativa {attempt}/{max_retries} de download falhou para {url}: {e}")
            if attempt < max_retries:
                time.sleep(3)
    return False

def sync_layer(layer, db_connection_str, work_dir):
    key = layer["key"]
    table = layer["table"]
    staging_table = f"{table}_staging"
    zip_path = os.path.join(work_dir, f"{key}.zip")
    extract_dir = os.path.join(work_dir, key)
    target_shp = layer.get("shp_name", "").lower()

    log(f"--- Iniciando sincronização: {layer['label']} ({layer['agency']}) ---")

    if is_layer_fresh(layer, db_connection_str, work_dir):
        log(f"SKIP: Camada {layer['label']} ({key}) já foi sincronizada com sucesso nas últimas 12h e está íntegra no PostGIS.")
        return True
    
    # 1. Download (com fallback local versionado para fontes com bloqueio geográfico)
    try:
        log(f"Baixando pacote oficial de {layer['url']}...")
        ok = download_file(layer["url"], zip_path)
        if not ok:
            fb = os.path.join(os.path.dirname(__file__), "fallback", f"{key}.zip")
            if os.path.exists(fb):
                log(f"Fonte online indisponível para {key}. Usando cópia de contingência do repositório: {fb}")
                shutil.copyfile(fb, zip_path)
            else:
                log(f"Falha ao baixar arquivo ou tamanho insuficiente para {key}.")
                return False
    except Exception as e:
        log(f"Exceção durante download de {key}: {e}")
        return False

    # 2. Descompactação seletiva (se shp_name for especificado, extrai apenas os arquivos daquela camada)
    os.makedirs(extract_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            if target_shp:
                stem = os.path.splitext(target_shp)[0]
                members = [m for m in zip_ref.namelist() if os.path.basename(m).lower().startswith(stem + ".")]
                zip_ref.extractall(extract_dir, members=members)
            else:
                zip_ref.extractall(extract_dir)
    except Exception as e:
        log(f"Falha ao extrair ZIP de {key}: {e}")
        return False

    # Remove o .zip logo após extrair para liberar espaço em disco no runner
    try:
        os.remove(zip_path)
    except OSError:
        pass

    # Localiza o arquivo vetorial (.shp, .geojson, .json, .gpkg)
    vector_file = None
    for root, dirs, files in os.walk(extract_dir):
        for f in sorted(files):
            fl = f.lower()
            if target_shp and fl == target_shp:
                vector_file = os.path.join(root, f)
                break
            elif not target_shp and fl.endswith((".shp", ".geojson", ".json", ".gpkg")):
                vector_file = os.path.join(root, f)
                break
        if vector_file:
            break

    if not vector_file:
        log(f"Nenhum arquivo vetorial correspondente encontrado no pacote de {key}.")
        return False

    log(f"Arquivo vetorial localizado: {vector_file}")

    # 3. Pré-limpeza de objetos residuais de staging antes do ogr2ogr
    pre_sql = f"""
    DROP TABLE IF EXISTS public.{table}_old CASCADE;
    DROP TABLE IF EXISTS public.{staging_table} CASCADE;
    DROP INDEX IF EXISTS public.{staging_table}_geom_geom_idx;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{staging_table}_pkey')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{table}_pkey') THEN
        EXECUTE 'ALTER INDEX public.{staging_table}_pkey RENAME TO {table}_pkey';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_class WHERE relname = '{staging_table}_id_seq')
         AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{table}_id_seq') THEN
        EXECUTE 'ALTER SEQUENCE public.{staging_table}_id_seq RENAME TO {table}_id_seq';
      END IF;
    END $$;
    """
    pre_sql_path = os.path.join(work_dir, f"pre_{key}.sql")
    with open(pre_sql_path, "w", encoding="utf-8") as f:
        f.write(pre_sql)
    run_command(f'psql "{db_connection_str}" -v ON_ERROR_STOP=1 -f "{pre_sql_path}"', timeout=60)

    # 4. Ingestão via ogr2ogr no PostGIS (em staging)
    # - -a_srs EPSG:4674: atribui SIRGAS 2000 diretamente (todas as fontes já estão em SIRGAS 2000),
    #   evitando que o PROJ aborte antes da sanitização SQL em pontos corrompidos na origem (ex: IPHAN).
    # - -dim XY: força geometrias 2D (remove eixo Z presente em iphan_pol e rodovias_estaduais).
    # - -lco SPATIAL_INDEX=NONE: índice GiST é criado após o RENAME para máxima velocidade no COPY e zero colisão.
    # - -fieldTypeToString Date,DateTime: evita falha do COPY em datas DBF inválidas (0000/00/00).
    nlt = "POINT" if layer["geom_type"] == "Point" else "PROMOTE_TO_MULTI"
    enc = layer.get("encoding", "LATIN1")
    select_arg = f'-select "{layer["select_fields"]}" ' if layer.get("select_fields") else ""
    where_arg = f'-where "{layer["where"]}" ' if layer.get("where") else ""

    ogr_cmd = (
        f'ogr2ogr -f "PostgreSQL" "{db_connection_str}" "{vector_file}" '
        f'-nln "{staging_table}" -overwrite -a_srs EPSG:4674 -dim XY '
        f'-lco GEOMETRY_NAME=geom -lco FID=id -lco SPATIAL_INDEX=NONE '
        f'-nlt {nlt} -fieldTypeToString Date,DateTime {select_arg}{where_arg}-gt 65536 '
        f'--config SHAPE_ENCODING {enc} --config OGR_EMPTY_DATE_AS_NULL YES --config PG_USE_COPY YES'
    )
    
    log(f"Ingerindo dados na tabela temporária {staging_table}...")
    if not run_command(ogr_cmd, timeout=2400):
        log(f"Falha na importação ogr2ogr de {key}.")
        shutil.rmtree(extract_dir, ignore_errors=True)
        return False

    shutil.rmtree(extract_dir, ignore_errors=True)

    # 5. Sanitização Topológica, Troca Atômica de Tabelas e Índice GiST via psql
    if layer["geom_type"] == "MultiPolygon":
        make_valid_sql = f"UPDATE public.{staging_table} SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) WHERE NOT ST_IsValid(geom);"
    elif layer["geom_type"] == "MultiLineString":
        make_valid_sql = f"UPDATE public.{staging_table} SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 2)) WHERE NOT ST_IsValid(geom);"
    else:
        make_valid_sql = ""

    swap_sql = f"""
    BEGIN;
    -- 1. Remove feições sem geometria, vazias ou com coordenadas corrompidas fora de [-180..180, -90..90]
    DELETE FROM public.{staging_table}
    WHERE geom IS NULL
       OR ST_IsEmpty(geom)
       OR ST_XMin(geom) < -180 OR ST_XMax(geom) > 180
       OR ST_YMin(geom) < -90  OR ST_YMax(geom) > 90;

    -- 2. Corrige geometrias inválidas preservando o tipo Multi*
    {make_valid_sql}
    DELETE FROM public.{staging_table} WHERE geom IS NULL OR ST_IsEmpty(geom);
    
    -- 3. Troca atômica de tabelas
    DROP TABLE IF EXISTS public.{table}_old CASCADE;
    ALTER TABLE IF EXISTS public.{table} RENAME TO {table}_old;
    ALTER TABLE public.{staging_table} RENAME TO {table};
    DROP TABLE IF EXISTS public.{table}_old CASCADE;

    -- 4. Renomeia PK/sequence e cria o índice espacial GiST definitivo
    ALTER INDEX IF EXISTS public.{staging_table}_pkey RENAME TO {table}_pkey;
    ALTER SEQUENCE IF EXISTS public.{staging_table}_id_seq RENAME TO {table}_id_seq;
    DROP INDEX IF EXISTS public.{staging_table}_geom_geom_idx;
    DROP INDEX IF EXISTS public.idx_{table}_geom;
    CREATE INDEX idx_{table}_geom ON public.{table} USING GIST (geom);

    -- 5. Garante permissões de leitura pública e RLS na nova tabela
    GRANT SELECT ON public.{table} TO anon, authenticated;
    ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_select_{table} ON public.{table};
    CREATE POLICY p_select_{table} ON public.{table} FOR SELECT USING (true);

    -- 6. Atualiza metadados
    INSERT INTO public.gov_layers_metadata (layer_key, layer_label, source_agency, last_sync_at, feature_count, sync_status, sync_message)
    VALUES ('{key}', '{layer["label"]}', '{layer["agency"]}', NOW(), (SELECT count(*) FROM public.{table}), 'ok', 'Sincronizado com sucesso via ETL')
    ON CONFLICT (layer_key) DO UPDATE SET
      layer_label = EXCLUDED.layer_label,
      source_agency = EXCLUDED.source_agency,
      last_sync_at = EXCLUDED.last_sync_at,
      feature_count = EXCLUDED.feature_count,
      sync_status = 'ok',
      sync_message = 'Sincronizado com sucesso via ETL';

    -- 7. Garante permissões na tabela de metadados
    GRANT SELECT ON public.gov_layers_metadata TO anon, authenticated;
    ALTER TABLE public.gov_layers_metadata ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_select_meta ON public.gov_layers_metadata;
    CREATE POLICY p_select_meta ON public.gov_layers_metadata FOR SELECT USING (true);

    COMMIT;
    """

    sql_path = os.path.join(work_dir, f"swap_{key}.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write(swap_sql)

    psql_cmd = f'psql "{db_connection_str}" -v ON_ERROR_STOP=1 -f "{sql_path}"'
    log(f"Executando transação atômica de troca de tabela e indexação GiST para {table}...")
    if not run_command(psql_cmd, timeout=600):
        log(f"Falha na transação SQL de {key}.")
        return False

    log(f"SUCESSO: Camada {layer['label']} atualizada com sucesso no PostGIS!")
    return True

def main():
    db_conn = os.environ.get("SUPABASE_DB_URL")
    if not db_conn:
        log("ERRO: Variável de ambiente SUPABASE_DB_URL não configurada.")
        log("Exemplo: postgresql://postgres.PROJECT_REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres")
        sys.exit(1)

    # 1. Teste de Sanidade de Conexão (Fail Fast em <15s sem esperar downloads)
    if not test_db_connection(db_conn):
        log("ABORTANDO: Conexão com o PostGIS não pôde ser estabelecida.")
        sys.exit(1)

    # 2. Aplica/atualiza o schema base e a função RPC analyze_project antes de iniciar
    apply_schema_and_rpc(db_conn)

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

    # 3. Reaplica a função RPC ao final para garantir que todas as tabelas recém-trocadas estejam vinculadas
    apply_schema_and_rpc(db_conn)

    log(f"ETL finalizado: {success_count}/{len(active_layers)} camadas sincronizadas com sucesso.")
    shutil.rmtree(work_dir, ignore_errors=True)

    if success_count == 0:
        log("ERRO FATAL: Nenhuma camada pôde ser sincronizada com o banco.")
        sys.exit(1)
    elif success_count < len(active_layers):
        log(f"PARCIAL: {success_count} de {len(active_layers)} camadas foram sincronizadas no PostGIS. Algumas fontes externas apresentaram instabilidade temporária e serão reprocessadas no próximo agendamento.")
    else:
        log("SUCESSO ABSOLUTO: Todas as camadas oficiais foram ingeridas no PostGIS com sucesso!")

if __name__ == "__main__":
    main()
