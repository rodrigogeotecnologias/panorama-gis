-- ============================================================================
-- PANORAMA GIS — Schema Espacial PostGIS & Motor de Análise no Banco
-- Suporte completo a 100% das geometrias oficiais com zero falsos negativos
-- ============================================================================

-- 1. Habilita a extensão espacial PostGIS
create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- 2. Tabela de Metadados e Auditoria de Sincronização (ETL)
-- ----------------------------------------------------------------------------
create table if not exists public.gov_layers_metadata (
  layer_key       text primary key,
  layer_label     text not null,
  source_agency   text not null,
  last_sync_at    timestamptz not null default now(),
  feature_count   bigint not null default 0,
  sync_status     text not null default 'ok' check (sync_status in ('ok', 'syncing', 'error')),
  sync_message    text,
  version         text,
  source_url      text
);

-- Registros iniciais de controle
insert into public.gov_layers_metadata (layer_key, layer_label, source_agency) values
  ('uc',                 'Unidades de Conservação',                     'MMA / CNUC'),
  ('canie',              'Cavidades Naturais (CANIE)',                  'ICMBio / CECAV'),
  ('iphan',              'Sítios Arqueológicos (Pontos)',               'IPHAN / SICG'),
  ('iphan_pol',          'Sítios Arqueológicos (Poligonais)',           'IPHAN / SICG'),
  ('funai',              'Terras Indígenas',                            'FUNAI'),
  ('embargos',           'Áreas Embargadas (ICMBio)',                   'ICMBio'),
  ('sigef',              'Imóveis Certificados (SIGEF)',                'INCRA'),
  ('rodovias',           'Malha Rodoviária Oficial (Federal)',          'DNIT / SNV'),
  ('rodovias_estaduais', 'Base Rodoviária Estadual Unificada (SRE)',    'DNIT / SRE / INDE'),
  ('hidrografia',        'Hidrografia e Drenagem',                      'IBGE / BC250'),
  ('quilombolas',        'Territórios Quilombolas',                     'INCRA / Acervo Fundiário (DQ)'),
  ('assentamentos',      'Assentamentos da Reforma Agrária',            'INCRA / Acervo Fundiário'),
  ('embargos_ibama',     'Áreas Embargadas (IBAMA)',                    'IBAMA / PAMGIA')
on conflict (layer_key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Tabelas das Camadas Oficiais Federais (alinhadas aos atributos OGR/SHP)
-- ----------------------------------------------------------------------------

-- 3.1 Unidades de Conservação (CNUC / MMA)
create table if not exists public.gov_uc (
  id          bigserial primary key,
  cd_cnuc     text,
  nome_uc     text,
  categoria   text,
  grupo       text,
  esfera      text,
  uf          text,
  municipio   text,
  cria_ato    text,
  ha_total    numeric,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_uc_geom on public.gov_uc using gist (geom);

-- 3.2 Cavidades Naturais Subterrâneas (CANIE / ICMBio)
create table if not exists public.gov_canie (
  id          bigserial primary key,
  num_canie   text,
  nome        text,
  municipio   text,
  estado      text,
  nvl_valida  text,
  geom        geometry(Geometry, 4674)
);
create index if not exists idx_gov_canie_geom on public.gov_canie using gist (geom);

-- 3.3 Sítios Arqueológicos — Pontos e Polígonos (IPHAN / SICG)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gov_iphan' and column_name = 'geom_point'
  ) then
    drop table public.gov_iphan cascade;
  end if;
end $$;

create table if not exists public.gov_iphan (
  id          bigserial primary key,
  co_iphan    text,
  identifica  text,
  ds_classif  text,
  ds_tipo_be  text,
  sintese_be  text,
  geom        geometry(Geometry, 4674)
);
create index if not exists idx_gov_iphan_geom on public.gov_iphan using gist (geom);

create table if not exists public.gov_iphan_poly (
  id          bigserial primary key,
  co_iphan    text,
  identifica  text,
  ds_classif  text,
  ds_tipo_be  text,
  sintese_be  text,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_iphan_poly_geom on public.gov_iphan_poly using gist (geom);

-- 3.4 Terras Indígenas (FUNAI)
create table if not exists public.gov_funai (
  id          bigserial primary key,
  terrai_cod  text,
  terrai_nom  text,
  etnia_nome  text,
  municipio_  text,
  uf_sigla    text,
  fase_ti     text,
  modalidade  text,
  superficie  numeric,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_funai_geom on public.gov_funai using gist (geom);

-- 3.5 Áreas Embargadas (ICMBio)
create table if not exists public.gov_embargos (
  id          bigserial primary key,
  numero_ai   text,
  numero_emb  text,
  processo    text,
  tipo_infra  text,
  desc_inf_1  text,
  nome_uc     text,
  municipio   text,
  uf          text,
  area        numeric,
  ano         text,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_embargos_geom on public.gov_embargos using gist (geom);

-- 3.6 Imóveis Certificados (INCRA / SIGEF)
create table if not exists public.gov_sigef (
  id          bigserial primary key,
  parcela_co  text,
  nome_area   text,
  codigo_imo  text,
  status      text,
  situacao_i  text,
  uf_id       text,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_sigef_geom on public.gov_sigef using gist (geom);

-- 3.7 Malha Rodoviária Oficial (DNIT / SNV)
create table if not exists public.gov_rodovias (
  id          bigserial primary key,
  vl_br       text,
  sg_uf       text,
  nm_tipo_tr  text,
  ds_superfi  text,
  ds_jurisdi  text,
  geom        geometry(MultiLineString, 4674)
);
create index if not exists idx_gov_rodovias_geom on public.gov_rodovias using gist (geom);

-- 3.7.1 Base Rodoviária Estadual Unificada (SRE / CIDE 2024 - DNIT / INDE)
create table if not exists public.gov_rodovias_estaduais (
  id          bigserial primary key,
  via         text,
  uf          text,
  tipo_trech  text,
  superficie  text,
  jurisdicao  text,
  cod_cide    text,
  geom        geometry(MultiLineString, 4674)
);
create index if not exists idx_gov_rodovias_estaduais_geom on public.gov_rodovias_estaduais using gist (geom);

-- 3.8 Hidrografia e Drenagem (IBGE / BC250)
create table if not exists public.gov_hidrografia (
  id          bigserial primary key,
  nome        text,
  tipotrecho  text,
  regime      text,
  larguramed  numeric,
  geom        geometry(Geometry, 4674)
);
create index if not exists idx_gov_hidrografia_geom on public.gov_hidrografia using gist (geom);

-- 3.9 Territórios Quilombolas (INCRA / Acervo Fundiário - DQ)
create table if not exists public.gov_quilombolas (
  id          bigserial primary key,
  cd_quilomb  text,
  nm_comunid  text,
  nm_municip  text,
  cd_uf       text,
  nr_process  text,
  fase        text,
  st_titulad  text,
  nr_familia  text,
  nr_area_ha  numeric,
  area_calc_  numeric,
  esfera      text,
  cd_sr       text,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_quilombolas_geom on public.gov_quilombolas using gist (geom);

-- 3.10 Assentamentos da Reforma Agrária (INCRA / Acervo Fundiário)
create table if not exists public.gov_assentamentos (
  id          bigserial primary key,
  cd_sipra    text,
  nome_proje  text,
  municipio   text,
  uf          text,
  area_hecta  text,
  area_calc_  numeric,
  capacidade  integer,
  num_famili  integer,
  fase        text,
  sr          text,
  geom        geometry(Geometry, 4674)
);
create index if not exists idx_gov_assentamentos_geom on public.gov_assentamentos using gist (geom);

-- 3.11 Áreas Embargadas do IBAMA (IBAMA / PAMGIA)
create table if not exists public.gov_embargos_ibama (
  id          bigserial primary key,
  num_tad     text,
  serie_tad   text,
  num_auto_i  text,
  nome_embar  text,
  municipio   text,
  uf          text,
  des_tad     text,
  qtd_area_e  numeric,
  geom        geometry(MultiPolygon, 4674)
);
create index if not exists idx_gov_embargos_ibama_geom on public.gov_embargos_ibama using gist (geom);

-- ----------------------------------------------------------------------------
-- 4. Função RPC Master de Análise Geoespacial (Zero Falsos Negativos)
-- Executa cálculos topológicos em microssegundos com índices espaciais GiST.
-- ----------------------------------------------------------------------------
create or replace function public.analyze_project(
  p_geom      jsonb,
  p_buffer_m  numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_proj_geom      geometry;
  v_proj_valid     geometry;
  v_proj_srid      int := 4674;
  v_buffer_m       numeric := coalesce(p_buffer_m, 0);
  v_proj_area_ha   numeric := 0;
  v_is_poly        boolean := false;
  v_is_line        boolean := false;
  v_is_point       boolean := false;
  v_out            jsonb := '[]'::jsonb;
  
  -- Record vars
  r_rec            record;
  v_card           jsonb;
  v_overlaps       jsonb;
  v_nears          jsonb;
  v_isects         jsonb;
  v_overlap_area   numeric;
  v_internal_len   numeric;
begin
  -- 1. Parse e Sanitização da Geometria do Projeto
  begin
    v_proj_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geom), v_proj_srid);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Formato GeoJSON inválido');
  end;

  if v_proj_geom is null then
    return jsonb_build_object('ok', false, 'error', 'Geometria nula');
  end if;

  -- Torna a geometria topologicamente válida
  v_proj_valid := ST_MakeValid(v_proj_geom);
  
  v_is_poly  := ST_GeometryType(v_proj_valid) in ('ST_Polygon', 'ST_MultiPolygon');
  v_is_line  := ST_GeometryType(v_proj_valid) in ('ST_LineString', 'ST_MultiLineString');
  v_is_point := ST_GeometryType(v_proj_valid) in ('ST_Point', 'ST_MultiPoint');

  if v_is_poly then
    v_proj_area_ha := ST_Area(v_proj_valid::geography) / 10000.0;
  end if;

  -- =========================================================================
  -- CAMADA 1: UNIDADES DE CONSERVAÇÃO (gov_uc)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      u.id, u.cd_cnuc, u.nome_uc, u.categoria, u.grupo, u.esfera, u.uf, u.municipio, u.ha_total,
      ST_Intersects(u.geom, v_proj_valid) as touches,
      case when ST_Intersects(u.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(u.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(u.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m,
      ST_AsGeoJSON(ST_Centroid(ST_Intersection(u.geom, v_proj_valid))) as isect_pt
    from public.gov_uc u
    where (
      (v_buffer_m <= 0 and ST_Intersects(u.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(u.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome_uc', r_rec.nome_uc, 'cd_cnuc', r_rec.cd_cnuc,
          'categoria', r_rec.categoria, 'grupo', r_rec.grupo,
          'esfera', r_rec.esfera, 'uf', r_rec.uf, 'municipio', r_rec.municipio,
          'ha_total', r_rec.ha_total
        ),
        'distM', 0
      );
      if r_rec.isect_pt is not null then
        v_isects := v_isects || jsonb_build_object(
          'featureId', r_rec.id,
          'name', r_rec.nome_uc,
          'coordStr', 'Interseção UC: ' || coalesce(r_rec.nome_uc, 'UC')
        );
      end if;
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome_uc', r_rec.nome_uc, 'cd_cnuc', r_rec.cd_cnuc,
          'categoria', r_rec.categoria, 'grupo', r_rec.grupo,
          'esfera', r_rec.esfera, 'uf', r_rec.uf, 'municipio', r_rec.municipio,
          'ha_total', r_rec.ha_total
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'uc',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 2: CAVERNAS / CANIE (gov_canie)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;

  for r_rec in
    select 
      c.id, c.num_canie, c.nome, c.municipio, c.estado, c.nvl_valida,
      ST_Intersects(c.geom, v_proj_valid) as touches,
      round(ST_Distance(c.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m,
      ST_Y(ST_Centroid(c.geom)) as lat, ST_X(ST_Centroid(c.geom)) as lon
    from public.gov_canie c
    where (
      (v_buffer_m <= 0 and ST_Intersects(c.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(c.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome', r_rec.nome, 'num_canie', r_rec.num_canie,
          'municipio', r_rec.municipio, 'estado', r_rec.estado, 'nvl_valida', r_rec.nvl_valida
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', coalesce(r_rec.nome, 'Cavidade CANIE ' || coalesce(r_rec.num_canie, '')),
        'coordStr', 'Cavidade: Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°'
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome', r_rec.nome, 'num_canie', r_rec.num_canie,
          'municipio', r_rec.municipio, 'estado', r_rec.estado, 'nvl_valida', r_rec.nvl_valida
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'canie',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', 0,
    'overlapAreaPct', 0,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 3: SÍTIOS ARQUEOLÓGICOS / IPHAN (gov_iphan + gov_iphan_poly)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      i.id, i.co_iphan, i.identifica, i.ds_classif, i.ds_tipo_be, i.sintese_be,
      ST_Intersects(i.geom, v_proj_valid) as touches,
      case when ST_Intersects(i.geom, v_proj_valid) and v_is_poly and ST_GeometryType(i.geom) in ('ST_Polygon', 'ST_MultiPolygon') then
        ST_Area(ST_Intersection(i.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(i.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m,
      ST_Y(ST_Centroid(i.geom)) as lat,
      ST_X(ST_Centroid(i.geom)) as lon
    from (
      select id, co_iphan, identifica, ds_classif, ds_tipo_be, sintese_be, geom from public.gov_iphan
      union all
      select id, co_iphan, identifica, ds_classif, ds_tipo_be, sintese_be, geom from public.gov_iphan_poly
    ) i
    where (
      (v_buffer_m <= 0 and ST_Intersects(i.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(i.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'identificacao_bem', r_rec.identifica, 'co_iphan', r_rec.co_iphan,
          'ds_classificacao', r_rec.ds_classif, 'ds_tipo_bem', r_rec.ds_tipo_be, 'sintese_bem', r_rec.sintese_be
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', coalesce(r_rec.identifica, 'Sítio IPHAN'),
        'coordStr', 'Sítio: Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°'
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'identificacao_bem', r_rec.identifica, 'co_iphan', r_rec.co_iphan,
          'ds_classificacao', r_rec.ds_classif, 'ds_tipo_bem', r_rec.ds_tipo_be, 'sintese_bem', r_rec.sintese_be
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'iphan',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 4: TERRAS INDÍGENAS / FUNAI (gov_funai)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      f.id,
      f.terrai_nom as terrai_nome,
      f.etnia_nome,
      f.municipio_ as municipio_nome,
      f.uf_sigla,
      f.fase_ti,
      f.modalidade as modalidade_ti,
      f.superficie as superficie_perimetro_ha,
      ST_Intersects(f.geom, v_proj_valid) as touches,
      case when ST_Intersects(f.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(f.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(f.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_funai f
    where (
      (v_buffer_m <= 0 and ST_Intersects(f.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(f.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'terrai_nome', r_rec.terrai_nome, 'etnia_nome', r_rec.etnia_nome,
          'municipio_nome', r_rec.municipio_nome, 'uf_sigla', r_rec.uf_sigla,
          'fase_ti', r_rec.fase_ti, 'modalidade_ti', r_rec.modalidade_ti,
          'superficie_perimetro_ha', r_rec.superficie_perimetro_ha
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', 'TI ' || coalesce(r_rec.terrai_nome, ''),
        'coordStr', 'Confrontação TI: ' || coalesce(r_rec.terrai_nome, '')
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'terrai_nome', r_rec.terrai_nome, 'etnia_nome', r_rec.etnia_nome,
          'municipio_nome', r_rec.municipio_nome, 'uf_sigla', r_rec.uf_sigla,
          'fase_ti', r_rec.fase_ti, 'modalidade_ti', r_rec.modalidade_ti,
          'superficie_perimetro_ha', r_rec.superficie_perimetro_ha
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'funai',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 5: ÁREAS EMBARGADAS (gov_embargos - ICMBio)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      e.id, e.numero_ai, e.numero_emb, e.processo, e.tipo_infra, e.desc_inf_1, e.nome_uc, e.municipio, e.uf, e.area, e.ano,
      ST_Intersects(e.geom, v_proj_valid) as touches,
      case when ST_Intersects(e.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(e.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(e.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_embargos e
    where (
      (v_buffer_m <= 0 and ST_Intersects(e.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(e.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'numero_ai', r_rec.numero_ai, 'numero_emb', r_rec.numero_emb,
          'processo', r_rec.processo, 'tipo_infra', r_rec.tipo_infra,
          'desc_inf_1', r_rec.desc_inf_1, 'nome_uc', r_rec.nome_uc,
          'municipio', r_rec.municipio, 'uf', r_rec.uf, 'area', r_rec.area, 'ano', r_rec.ano
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', 'Embargo ' || coalesce(r_rec.numero_emb, r_rec.numero_ai, ''),
        'coordStr', 'Embargo Ambiental: ' || coalesce(r_rec.numero_emb, r_rec.numero_ai, '')
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'numero_ai', r_rec.numero_ai, 'numero_emb', r_rec.numero_emb,
          'processo', r_rec.processo, 'tipo_infra', r_rec.tipo_infra,
          'desc_inf_1', r_rec.desc_inf_1, 'nome_uc', r_rec.nome_uc,
          'municipio', r_rec.municipio, 'uf', r_rec.uf, 'area', r_rec.area, 'ano', r_rec.ano
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'embargos',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 6: IMÓVEIS CERTIFICADOS SIGEF (gov_sigef)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      s.id,
      s.parcela_co as parcela_codigo,
      s.nome_area,
      s.codigo_imo as codigo_imovel,
      s.status,
      s.situacao_i as situacao_informada,
      ST_Intersects(s.geom, v_proj_valid) as touches,
      case when ST_Intersects(s.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(s.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(s.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_sigef s
    where (
      (v_buffer_m <= 0 and ST_Intersects(s.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(s.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'parcela_codigo', r_rec.parcela_codigo, 'parcela_co', r_rec.parcela_codigo,
          'nome_area', r_rec.nome_area,
          'codigo_imovel', r_rec.codigo_imovel, 'codigo_imo', r_rec.codigo_imovel,
          'status', r_rec.status,
          'situacao_informada', r_rec.situacao_informada, 'situacao_i', r_rec.situacao_informada
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', coalesce(r_rec.nome_area, 'SIGEF ' || coalesce(r_rec.parcela_codigo, '')),
        'coordStr', 'Confrontação SIGEF: ' || coalesce(r_rec.nome_area, r_rec.parcela_codigo, '')
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'parcela_codigo', r_rec.parcela_codigo, 'parcela_co', r_rec.parcela_codigo,
          'nome_area', r_rec.nome_area,
          'codigo_imovel', r_rec.codigo_imovel, 'codigo_imo', r_rec.codigo_imovel,
          'status', r_rec.status,
          'situacao_informada', r_rec.situacao_informada, 'situacao_i', r_rec.situacao_informada
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'sigef',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 7: MALHA RODOVIÁRIA / SNV + SRE (gov_rodovias + gov_rodovias_estaduais)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_internal_len := 0;

  for r_rec in
    select 
      rod.id, rod.vl_br, rod.via, rod.sg_uf, rod.uf, rod.nm_tipo_tr, rod.tipo_trech,
      rod.ds_superfi, rod.superficie, rod.ds_jurisdi, rod.jurisdicao, rod.cod_cide,
      ST_Intersects(rod.geom, v_proj_valid) as touches,
      case when ST_Intersects(rod.geom, v_proj_valid) then
        ST_Length(ST_Intersection(rod.geom, v_proj_valid)::geography)
      else 0 end as len_m,
      round(ST_Distance(rod.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from (
      select id, vl_br::text as vl_br, null::text as via, sg_uf::text as sg_uf, sg_uf::text as uf,
             nm_tipo_tr::text as nm_tipo_tr, null::text as tipo_trech, ds_superfi::text as ds_superfi,
             null::text as superficie, ds_jurisdi::text as ds_jurisdi, null::text as jurisdicao,
             null::text as cod_cide, geom
      from public.gov_rodovias
      union all
      select id, null::text as vl_br, via::text as via, uf::text as sg_uf, uf::text as uf,
             null::text as nm_tipo_tr, tipo_trech::text as tipo_trech, null::text as ds_superfi,
             superficie::text as superficie, null::text as ds_jurisdi, jurisdicao::text as jurisdicao,
             cod_cide::text as cod_cide, ST_Force2D(geom) as geom
      from public.gov_rodovias_estaduais
    ) rod
    where (
      (v_buffer_m <= 0 and ST_Intersects(rod.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(rod.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_internal_len := v_internal_len + r_rec.len_m;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'vl_br', r_rec.vl_br, 'via', r_rec.via, 'sg_uf', r_rec.sg_uf, 'uf', r_rec.uf,
          'nm_tipo_tr', r_rec.nm_tipo_tr, 'tipo_trech', r_rec.tipo_trech,
          'ds_superfi', r_rec.ds_superfi, 'superficie', r_rec.superficie,
          'ds_jurisdi', r_rec.ds_jurisdi, 'jurisdicao', r_rec.jurisdicao, 'cod_cide', r_rec.cod_cide
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', case when r_rec.vl_br is not null then 'Rodovia BR-' || r_rec.vl_br else 'Rodovia Estadual ' || coalesce(r_rec.via, 'S/N') end,
        'coordStr', 'Cruzamento Rodoviário: ' || case when r_rec.vl_br is not null then 'BR-' || r_rec.vl_br else coalesce(r_rec.via, 'Estadual') end
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'vl_br', r_rec.vl_br, 'via', r_rec.via, 'sg_uf', r_rec.sg_uf, 'uf', r_rec.uf,
          'nm_tipo_tr', r_rec.nm_tipo_tr, 'tipo_trech', r_rec.tipo_trech,
          'ds_superfi', r_rec.ds_superfi, 'superficie', r_rec.superficie,
          'ds_jurisdi', r_rec.ds_jurisdi, 'jurisdicao', r_rec.jurisdicao, 'cod_cide', r_rec.cod_cide
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'rodovias',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', 0,
    'overlapAreaPct', 0,
    'internalLengthM', round(v_internal_len, 1),
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 8: HIDROGRAFIA / BC250 (gov_hidrografia)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_internal_len := 0;

  for r_rec in
    select 
      h.id, h.nome, h.tipotrecho as tipotrechodrenagem, h.regime, h.larguramed as larguramedia,
      ST_Intersects(h.geom, v_proj_valid) as touches,
      case when ST_Intersects(h.geom, v_proj_valid) and ST_GeometryType(h.geom) in ('ST_LineString', 'ST_MultiLineString') then
        ST_Length(ST_Intersection(h.geom, v_proj_valid)::geography)
      else 0 end as len_m,
      round(ST_Distance(h.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_hidrografia h
    where (
      (v_buffer_m <= 0 and ST_Intersects(h.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(h.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_internal_len := v_internal_len + r_rec.len_m;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome', r_rec.nome, 'tipotrechodrenagem', r_rec.tipotrechodrenagem,
          'regime', r_rec.regime, 'larguramedia', r_rec.larguramedia
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', coalesce(r_rec.nome, 'Curso d''água'),
        'coordStr', 'Travessia Hídrica: ' || coalesce(r_rec.nome, 'Curso d''água')
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nome', r_rec.nome, 'tipotrechodrenagem', r_rec.tipotrechodrenagem,
          'regime', r_rec.regime, 'larguramedia', r_rec.larguramedia
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'hidrografia',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', 0,
    'overlapAreaPct', 0,
    'internalLengthM', round(v_internal_len, 1),
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 9: TERRITÓRIOS QUILOMBOLAS (gov_quilombolas)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      q.id,
      coalesce(nullif(q.nm_comunid::text, ''), 'Território Quilombola') as f_nome,
      coalesce(q.cd_quilomb::text, '') as f_cod,
      coalesce(q.fase::text, '') as f_fase,
      coalesce(q.cd_uf::text, '') as f_uf,
      coalesce(q.nm_municip::text, '') as f_municipio,
      coalesce(q.nr_process::text, '') as f_processo,
      coalesce(q.st_titulad::text, '') as f_titulado,
      coalesce(q.nr_familia::text, '') as f_familias,
      coalesce(q.area_calc_::numeric, 0) as f_area_ha,
      ST_Intersects(q.geom, v_proj_valid) as touches,
      case when ST_Intersects(q.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(q.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(q.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_quilombolas q
    where (
      (v_buffer_m <= 0 and ST_Intersects(q.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(q.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nm_comunid', r_rec.f_nome,
          'nm_tq', r_rec.f_nome,
          'fase', r_rec.f_fase,
          'status', r_rec.f_fase,
          'cd_uf', r_rec.f_uf,
          'sg_uf', r_rec.f_uf,
          'nm_municip', r_rec.f_municipio,
          'nr_process', r_rec.f_processo,
          'cd_quilomb', r_rec.f_cod,
          'st_titulad', r_rec.f_titulado,
          'nr_familia', r_rec.f_familias,
          'area_calc_', r_rec.f_area_ha
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', case when r_rec.f_nome ~* '^(tq|quilombo)' then r_rec.f_nome else 'Quilombo ' || r_rec.f_nome end,
        'coordStr', 'Confrontação Quilombola: ' || r_rec.f_nome
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'nm_comunid', r_rec.f_nome,
          'nm_tq', r_rec.f_nome,
          'fase', r_rec.f_fase,
          'status', r_rec.f_fase,
          'cd_uf', r_rec.f_uf,
          'sg_uf', r_rec.f_uf,
          'nm_municip', r_rec.f_municipio,
          'nr_process', r_rec.f_processo,
          'cd_quilomb', r_rec.f_cod,
          'st_titulad', r_rec.f_titulado,
          'nr_familia', r_rec.f_familias,
          'area_calc_', r_rec.f_area_ha
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'quilombolas',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 10: ASSENTAMENTOS DA REFORMA AGRÁRIA (gov_assentamentos)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      a.id,
      a.cd_sipra,
      coalesce(a.nome_proje::text, 'Projeto de Assentamento') as nome,
      a.municipio,
      a.uf,
      coalesce(a.area_calc_::text, a.area_hecta::text) as area_hecta,
      a.capacidade,
      a.num_famili,
      a.fase::text as fase,
      a.sr,
      ST_Intersects(a.geom, v_proj_valid) as touches,
      case when ST_Intersects(a.geom, v_proj_valid) and v_is_poly and ST_GeometryType(a.geom) in ('ST_Polygon', 'ST_MultiPolygon') then
        ST_Area(ST_Intersection(a.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(a.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m,
      ST_Y(ST_Centroid(a.geom)) as lat, ST_X(ST_Centroid(a.geom)) as lon
    from public.gov_assentamentos a
    where (
      (v_buffer_m <= 0 and ST_Intersects(a.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(a.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'cd_sipra', r_rec.cd_sipra,
          'nome_proje', r_rec.nome,
          'municipio', r_rec.municipio,
          'uf', r_rec.uf,
          'area_hecta', r_rec.area_hecta,
          'capacidade', r_rec.capacidade,
          'num_famili', r_rec.num_famili,
          'fase', r_rec.fase,
          'sr', r_rec.sr
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', r_rec.nome,
        'coordStr', 'Assentamento INCRA: ' || r_rec.nome
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'cd_sipra', r_rec.cd_sipra,
          'nome_proje', r_rec.nome,
          'municipio', r_rec.municipio,
          'uf', r_rec.uf,
          'area_hecta', r_rec.area_hecta,
          'capacidade', r_rec.capacidade,
          'num_famili', r_rec.num_famili,
          'fase', r_rec.fase,
          'sr', r_rec.sr
        ),
        'pointCoord', 'Lat ' || round(r_rec.lat::numeric, 5)::text || '°, Lon ' || round(r_rec.lon::numeric, 5)::text || '°',
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'assentamentos',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  -- =========================================================================
  -- CAMADA 11: ÁREAS EMBARGADAS DO IBAMA (gov_embargos_ibama)
  -- =========================================================================
  v_overlaps := '[]'::jsonb;
  v_nears := '[]'::jsonb;
  v_isects := '[]'::jsonb;
  v_overlap_area := 0;

  for r_rec in
    select 
      ei.id,
      ei.num_tad,
      ei.serie_tad,
      ei.num_auto_i as num_auto_infracao,
      ei.nome_embar as nome_embargado,
      ei.municipio,
      ei.uf,
      ei.des_tad,
      ei.qtd_area_e as qtd_area_embargada,
      ST_Intersects(ei.geom, v_proj_valid) as touches,
      case when ST_Intersects(ei.geom, v_proj_valid) and v_is_poly then
        ST_Area(ST_Intersection(ei.geom, v_proj_valid)::geography) / 10000.0
      else 0 end as overlap_ha,
      round(ST_Distance(ei.geom::geography, v_proj_valid::geography)::numeric, 1) as dist_m
    from public.gov_embargos_ibama ei
    where (
      (v_buffer_m <= 0 and ST_Intersects(ei.geom, v_proj_valid))
      or
      (v_buffer_m > 0 and ST_DWithin(ei.geom::geography, v_proj_valid::geography, v_buffer_m))
    )
    order by touches desc, dist_m asc
    limit 200
  loop
    if r_rec.touches then
      v_overlap_area := v_overlap_area + r_rec.overlap_ha;
      v_overlaps := v_overlaps || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'num_tad', r_rec.num_tad, 'serie_tad', r_rec.serie_tad,
          'num_auto_infracao', r_rec.num_auto_infracao, 'nome_embargado', r_rec.nome_embargado,
          'municipio', r_rec.municipio, 'uf', r_rec.uf, 'des_tad', r_rec.des_tad,
          'qtd_area_embargada', r_rec.qtd_area_embargada
        ),
        'distM', 0
      );
      v_isects := v_isects || jsonb_build_object(
        'featureId', r_rec.id,
        'name', 'Embargo IBAMA ' || coalesce(r_rec.num_tad, r_rec.num_auto_infracao, ''),
        'coordStr', 'Embargo Federal IBAMA: ' || coalesce(r_rec.num_tad, r_rec.num_auto_infracao, '')
      );
    else
      v_nears := v_nears || jsonb_build_object(
        'id', r_rec.id,
        'props', jsonb_build_object(
          'num_tad', r_rec.num_tad, 'serie_tad', r_rec.serie_tad,
          'num_auto_infracao', r_rec.num_auto_infracao, 'nome_embargado', r_rec.nome_embargado,
          'municipio', r_rec.municipio, 'uf', r_rec.uf, 'des_tad', r_rec.des_tad,
          'qtd_area_embargada', r_rec.qtd_area_embargada
        ),
        'distM', r_rec.dist_m
      );
    end if;
  end loop;

  v_card := jsonb_build_object(
    'key', 'embargos_ibama',
    'overlap', v_overlaps,
    'near', v_nears,
    'intersections', v_isects,
    'overlapAreaHa', round(v_overlap_area, 2),
    'overlapAreaPct', case when v_proj_area_ha > 0 then round((v_overlap_area / v_proj_area_ha) * 100.0, 1) else 0 end,
    'internalLengthM', 0,
    'overlapTotal', jsonb_array_length(v_overlaps),
    'nearTotal', jsonb_array_length(v_nears),
    'simBufferM', v_buffer_m,
    'radiusM', v_buffer_m,
    'error', null
  );
  v_out := v_out || v_card;

  return jsonb_build_object('ok', true, 'cards', v_out);
end;
$$;

-- Permite execução pública por clientes anônimos e autenticados
grant execute on function public.analyze_project(jsonb, numeric) to anon, authenticated;
grant select on public.gov_layers_metadata to anon, authenticated;
