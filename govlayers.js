// ============================================================================
// PANORAMA GIS — Camadas oficiais consumidas AO VIVO direto da fonte (sem cópia local)
//  - Exibição no mapa: WMS (imagem) servido pelo próprio órgão
//  - Cruzamentos / identificação: WFS com filtro espacial (CQL) executado no servidor do órgão
//  - Fontes sem CORS (FUNAI, IPHAN) passam pela Edge Function "gov-proxy" (Supabase)
// Para trocar de versão de uma base (ex.: novo CNUC) basta alterar o typeName abaixo.
// ============================================================================
(function () {
  const INDE = 'https://geoservicos.inde.gov.br/geoserver';

  const km = (m) => (m >= 1000 ? `${(m / 1000).toString().replace('.', ',')} km` : `${m} m`);

  const LAYERS = {
    uc: {
      key: 'uc',
      label: 'Unidades de Conservação',
      sub: 'CNUC/MMA • federais, estaduais e municipais',
      source: 'MMA / CNUC',
      geomType: 'polygon',
      color: '#16a34a',
      legendUrl: `${INDE}/MMA/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=MMA:cnuc_26_07_31&legend_options=forceLabels:off`,
      defaultOn: true,
      proxy: false,
      sources: [{ url: `${INDE}/MMA/ows`, typeName: 'MMA:cnuc_26_07_31', geom: 'the_geom', kind: 'polygon' }],
      wms: { url: `${INDE}/MMA/wms`, layers: 'MMA:cnuc_26_07_31' },
      fields: ['nome_uc', 'cd_cnuc', 'categoria', 'grupo', 'esfera', 'uf', 'municipio', 'cria_ato', 'ha_total'],
      describe: (p) => ({
        title: p.nome_uc,
        code: p.cd_cnuc ? `CNUC ${p.cd_cnuc}` : '',
        lines: [
          [p.categoria, p.grupo, p.esfera].filter(Boolean).join(' • '),
          [p.municipio, p.uf].filter(Boolean).join(' / '),
          p.ha_total ? `Área oficial: ${Number(p.ha_total).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : '',
        ],
      }),
      card: {
        title: 'Unidades de Conservação (CNUC / MMA)',
        overlapLevel: (items) => (items.some((i) => /integral/i.test(i.props.grupo || '')) ? 'danger' : 'warning'),
        overlapStatus: 'SOBREPOSIÇÃO UC',
        near: { radiusM: 10000, status: 'ENTORNO (10 km)' },
      },
    },

    canie: {
      key: 'canie',
      label: 'Cavidades Naturais (CANIE)',
      sub: 'CECAV / ICMBio • cadastro nacional',
      source: 'ICMBio / CECAV',
      geomType: 'point',
      color: '#231F1F',
      legendUrl: `${INDE}/ICMBio/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=ICMBio:canie_052026_p&legend_options=forceLabels:off`,
      defaultOn: true,
      proxy: false,
      sources: [{ url: `${INDE}/ICMBio/ows`, typeName: 'ICMBio:canie_052026_p', geom: 'the_geom', kind: 'point' }],
      wms: { url: `${INDE}/ICMBio/wms`, layers: 'ICMBio:canie_052026_p' },
      fields: ['num_canie', 'nome', 'municipio', 'estado', 'nvl_valida'],
      describe: (p) => ({
        title: p.nome || 'Cavidade natural subterrânea',
        code: p.num_canie ? `CANIE ${p.num_canie}` : '',
        lines: [[p.municipio, p.estado].filter(Boolean).join(' / '), p.nvl_valida ? `Validação CECAV: ${p.nvl_valida}` : ''],
      }),
      card: {
        title: 'Cavidades Naturais Subterrâneas (CANIE)',
        overlapLevel: 'danger',
        overlapStatus: 'CAVIDADE NA ÁREA',
        near: { radiusM: 2500, status: 'RAIO 2,5 KM' },
      },
    },

    iphan: {
      key: 'iphan',
      label: 'Sítios Arqueológicos (IPHAN)',
      sub: 'SICG / IPHAN • pontos e polígonos',
      source: 'IPHAN / SICG',
      geomType: 'point',
      color: '#1A4C59',
      legendUrl: 'https://geoserver.iphan.gov.br/geoserver/SICG/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=SICG:sitios&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: true,
      sources: [
        { url: 'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName: 'SICG:sitios', geom: 'ponto', kind: 'point' },
        { url: 'https://geoserver.iphan.gov.br/geoserver/SICG/ows', typeName: 'SICG:sitios_pol', geom: 'poligono', kind: 'polygon' },
      ],
      wms: { url: 'https://geoserver.iphan.gov.br/geoserver/SICG/wms', layers: 'SICG:sitios_pol,SICG:sitios' },
      fields: ['identificacao_bem', 'co_iphan', 'ds_classificacao', 'ds_tipo_bem', 'sintese_bem'],
      describe: (p) => ({
        title: p.identificacao_bem || 'Sítio arqueológico',
        code: p.co_iphan ? `IPHAN ${p.co_iphan}` : '',
        lines: [[p.ds_classificacao, p.ds_tipo_bem].filter(Boolean).join(' • '), (p.sintese_bem || '').slice(0, 160)],
      }),
      card: {
        title: 'Sítios Arqueológicos (IPHAN / SICG)',
        overlapLevel: 'danger',
        overlapStatus: 'IPHAN ACIONADO',
        near: { radiusM: 2500, status: 'RAIO 2,5 KM' },
      },
    },

    funai: {
      key: 'funai',
      label: 'Terras Indígenas (FUNAI)',
      sub: 'Polígonos oficiais • todas as fases',
      source: 'FUNAI',
      geomType: 'polygon',
      color: '#a855f7',
      legendUrl: 'https://geoserver.funai.gov.br/geoserver/Funai/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=Funai:tis_poligonais&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: true,
      sources: [{ url: 'https://geoserver.funai.gov.br/geoserver/Funai/ows', typeName: 'Funai:tis_poligonais', geom: 'the_geom', kind: 'polygon' }],
      wms: { url: 'https://geoserver.funai.gov.br/geoserver/Funai/wms', layers: 'Funai:tis_poligonais' },
      fields: ['terrai_nome', 'etnia_nome', 'municipio_nome', 'uf_sigla', 'fase_ti', 'modalidade_ti', 'superficie_perimetro_ha'],
      describe: (p) => ({
        title: `TI ${p.terrai_nome || ''}`,
        code: p.fase_ti || '',
        lines: [
          [p.etnia_nome ? `Etnia: ${p.etnia_nome}` : '', p.modalidade_ti].filter(Boolean).join(' • '),
          [p.municipio_nome, p.uf_sigla].filter(Boolean).join(' / '),
        ],
      }),
      card: {
        title: 'Terras Indígenas (FUNAI)',
        overlapLevel: 'danger',
        overlapStatus: 'SOBREPOSIÇÃO TI',
        near: { radiusM: 10000, status: 'ENTORNO (10 km)' },
      },
    },

    embargos: {
      key: 'embargos',
      label: 'Áreas Embargadas (ICMBio)',
      sub: 'Termos de embargo • polígonos',
      source: 'ICMBio',
      geomType: 'polygon',
      color: '#ea580c',
      legendUrl: `${INDE}/ICMBio/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=ICMBio:autos_infracao_icmbio&legend_options=forceLabels:off`,
      defaultOn: true,
      proxy: false,
      sources: [{ url: `${INDE}/ICMBio/ows`, typeName: 'ICMBio:embargos_icmbio', geom: 'the_geom', kind: 'polygon' }],
      wms: { url: `${INDE}/ICMBio/wms`, layers: 'ICMBio:autos_infracao_icmbio,ICMBio:embargos_icmbio' },
      fields: ['numero_ai', 'numero_emb', 'processo', 'tipo_infra', 'desc_inf_1', 'nome_uc', 'municipio', 'uf', 'area', 'ano'],
      describe: (p) => ({
        title: `Embargo ${p.numero_emb || p.numero_ai || ''}`.trim(),
        code: p.processo ? `Proc. ${p.processo}` : '',
        lines: [p.desc_inf_1 || p.tipo_infra || '', [p.nome_uc, [p.municipio, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' • '), p.area ? `Área: ${p.area} ha` : ''],
      }),
      card: {
        title: 'Áreas Embargadas (ICMBio)',
        overlapLevel: 'danger',
        overlapStatus: 'EMBARGO ATIVO',
      },
    },

    sigef: {
      key: 'sigef',
      label: 'Imóveis Certificados (SIGEF)',
      sub: 'INCRA • parcelas georreferenciadas',
      source: 'INCRA / SIGEF',
      geomType: 'polygon',
      color: '#64748b',
      legendUrl: 'https://geoportal.incra.gov.br/geoserver/ows?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=geonode:sigef_geo&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: false,
      sources: [{ url: 'https://geoportal.incra.gov.br/geoserver/ows', typeName: 'geonode:sigef_geo', geom: 'geometry', kind: 'polygon' }],
      wms: { url: 'https://geoportal.incra.gov.br/geoserver/ows', layers: 'geonode:sigef_geo' },
      fields: ['parcela_codigo', 'parcela_co', 'nome_area', 'codigo_imovel', 'codigo_imo', 'area_hectares', 'status', 'natureza', 'situacao_informada', 'situacao_i'],
      describe: (p) => ({
        title: p.nome_area || 'Parcela certificada',
        code: (p.parcela_codigo || p.parcela_co) ? `SIGEF ${p.parcela_codigo || p.parcela_co}` : '',
        lines: [
          [p.codigo_imovel || p.codigo_imo ? `SNCR: ${p.codigo_imovel || p.codigo_imo}` : '', p.natureza, p.status, p.situacao_informada || p.situacao_i].filter(Boolean).join(' • '),
          p.area_hectares ? `${Number(p.area_hectares).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : '',
        ],
      }),
      card: {
        title: 'Imóveis Certificados (INCRA / SIGEF)',
        overlapLevel: 'warning',
        overlapStatus: 'PARCELA SIGEF',
      },
    },

    rodovias: {
      key: 'rodovias',
      label: 'Malha Rodoviária (DNIT / SNV / SRE)',
      sub: 'Rodovias Federais (SNV) e Estaduais Unificadas (SRE) – 2024',
      source: 'DNIT / SRE / INDE',
      geomType: 'line',
      color: '#dc2626',
      legendUrl: `${INDE}/DNIT/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=DNIT:snv_202507a&legend_options=forceLabels:off`,
      defaultOn: true,
      proxy: false,
      sources: [
        { 
          url: `${INDE}/DNIT/ows`, 
          typeName: 'DNIT:snv_202507a', 
          geom: 'the_geom', 
          kind: 'line',
          fields: ['vl_br', 'sg_uf', 'nm_tipo_tr', 'ds_superfi', 'ds_jurisdi']
        },
        { 
          url: `${INDE}/DNIT/ows`, 
          typeName: 'DNIT:cide_2024_25', 
          geom: 'the_geom', 
          kind: 'line',
          fields: ['via', 'uf', 'tipo_trech', 'superficie', 'jurisdicao']
        },
      ],
      wms: { url: `${INDE}/DNIT/wms`, layers: 'DNIT:snv_202507a,DNIT:cide_2024_25' },
      fields: ['vl_br', 'via', 'uf', 'sg_uf', 'nm_tipo_tr', 'tipo_trech', 'ds_superfi', 'superficie', 'ds_jurisdi', 'jurisdicao'],
      describe: (p) => {
        const isEstadual = Boolean(p.via || p.jurisdicao === 'Estadual' || p.cod_cide);
        const roadCode = p.vl_br ? `Rodovia BR-${p.vl_br}` : (p.via ? `Rodovia Estadual ${p.via}` : 'Trecho Rodoviário');
        const ufText = p.sg_uf || p.uf || '';
        const jurText = p.ds_jurisdi || p.jurisdicao || (isEstadual ? 'Estadual (SRE)' : 'Federal (DNIT)');
        const supText = p.ds_superfi || p.superficie || '';
        const tipoText = p.nm_tipo_tr || p.tipo_trech || '';
        return {
          title: roadCode,
          code: [ufText, jurText].filter(Boolean).join(' – '),
          lines: [
            [supText ? `Superfície: ${supText}` : '', tipoText].filter(Boolean).join(' – '),
          ],
        };
      },
      card: {
        title: 'Malha Rodoviária (DNIT / SNV / SRE)',
        overlapLevel: 'warning',
        overlapStatus: 'INTERSECÇÃO RODOVIÁRIA',
        near: { radiusM: 5000, status: 'PROXIMIDADE (5 km)' },
      },
    },

    hidrografia: {
      key: 'hidrografia',
      label: 'Hidrografia e Drenagem (IBGE)',
      sub: 'Cursos d\'água, rios e drenagem • BC250',
      source: 'IBGE / BC250',
      geomType: 'line',
      color: '#2563eb',
      legendUrl: 'https://geoservicos.ibge.gov.br/geoserver/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=CCAR:BC250_2023_Trecho_Drenagem_L&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: false,
      sources: [{ url: 'https://geoservicos.ibge.gov.br/geoserver/ows', typeName: 'CCAR:BC250_2023_Trecho_Drenagem_L', geom: 'geom', kind: 'line' }],
      wms: { url: 'https://geoservicos.ibge.gov.br/geoserver/wms', layers: 'CCAR:BC250_2023_Trecho_Drenagem_L' },
      fields: ['nome', 'tipotrechodrenagem', 'regime', 'larguramedia'],
      describe: (p) => ({
        title: p.nome || 'Curso d\'água / Drenagem',
        code: p.regime ? `Regime: ${p.regime}` : '',
        lines: [
          [p.tipotrechodrenagem, p.larguramedia ? `Largura média: ${p.larguramedia} m` : ''].filter(Boolean).join(' • '),
        ],
      }),
      card: {
        title: 'Hidrografia e Drenagem (IBGE)',
        overlapLevel: 'warning',
        overlapStatus: 'CORPO HÍDRICO NA ÁREA',
        near: { radiusM: 2000, status: 'PROXIMIDADE (2 km)' },
      },
    },

    quilombolas: {
      key: 'quilombolas',
      label: 'Territórios Quilombolas',
      sub: 'INCRA • Acervo Fundiário oficial (Decreto nº 4.887/2003)',
      source: 'INCRA / Acervo Fundiário',
      geomType: 'polygon',
      color: '#9333ea',
      legendUrl: 'https://geoservicos.ibge.gov.br/geoserver/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=CGMAT:qg_2022_620_territorioquilombola__v02&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: false,
      sources: [{ url: 'https://geoservicos.ibge.gov.br/geoserver/ows', typeName: 'CGMAT:qg_2022_620_territorioquilombola__v02', geom: 'geom', kind: 'polygon' }],
      wms: { url: 'https://geoservicos.ibge.gov.br/geoserver/wms', layers: 'CGMAT:qg_2022_620_territorioquilombola__v02' },
      fields: ['nm_comunid', 'nm_tq', 'fase', 'status', 'cd_uf', 'sg_uf', 'nm_municip', 'nr_process', 'cd_quilomb', 'cd_tq', 'st_titulad', 'nr_familia', 'area_calc_', 'nr_area_ha', 'esfera'],
      describe: (p) => {
        const rawNome = p.nm_comunid || p.nm_tq || 'Território Quilombola';
        const title = /^(tq|quilombo)/i.test(rawNome.trim()) ? rawNome : `Quilombo ${rawNome}`;
        const proc = p.nr_process ? `Proc: ${p.nr_process}` : (p.cd_quilomb ? `Cód: ${p.cd_quilomb}` : (p.cd_tq ? `Cód ${p.cd_tq}` : 'INCRA'));
        const loc = [p.nm_municip, p.cd_uf || p.sg_uf].filter(Boolean).join(' / ');
        const fase = p.fase || p.status || (p.st_titulad === 'S' ? 'Titulado' : '');
        const areaVal = Number(p.area_calc_ || p.nr_area_ha);
        const area = !isNaN(areaVal) && areaVal > 0 ? `${areaVal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : '';
        const familias = p.nr_familia && !String(p.nr_familia).includes('*') ? `${p.nr_familia} famílias` : '';
        return {
          title,
          code: [proc, loc].filter(Boolean).join(' • '),
          lines: [
            [fase ? `Fase: ${fase}` : '', area, familias].filter(Boolean).join(' • '),
          ],
        };
      },
      card: {
        title: 'Territórios Quilombolas (INCRA / Acervo Fundiário)',
        overlapLevel: 'danger',
        overlapStatus: 'SOBREPOSIÇÃO QUILOMBOLA',
        near: { radiusM: 10000, status: 'ENTORNO (10 km)' },
      },
    },

    assentamentos: {
      key: 'assentamentos',
      label: 'Assentamentos da Reforma Agrária',
      sub: 'INCRA • Acervo Fundiário oficial (Lei nº 4.504/1964)',
      source: 'INCRA / Acervo Fundiário',
      geomType: 'polygon',
      color: '#10b981',
      legendUrl: 'https://geoservicos.ibge.gov.br/geoserver/wms?service=WMS&request=GetLegendGraphic&format=image/png&width=20&height=20&layer=CGEO:APL_Localidades_Projeto_De_Assentamento&legend_options=forceLabels:off',
      defaultOn: true,
      proxy: false,
      sources: [{ url: 'https://geoservicos.ibge.gov.br/geoserver/ows', typeName: 'CGEO:APL_Localidades_Projeto_De_Assentamento', geom: 'geom', kind: 'point' }],
      wms: { url: 'https://geoservicos.ibge.gov.br/geoserver/wms', layers: 'CGEO:APL_Localidades_Projeto_De_Assentamento' },
      fields: ['cd_sipra', 'nome_proje', 'municipio', 'uf', 'area_hecta', 'capacidade', 'num_famili', 'fase', 'sr', 'nm_localid', 'nm_municip', 'sigla_uf'],
      describe: (p) => ({
        title: p.nome_proje || p.nm_localid || 'Projeto de Assentamento',
        code: p.cd_sipra ? `SIPRA ${p.cd_sipra}` : (p.nm_categor || 'Assentamento INCRA'),
        lines: [
          [p.municipio || p.nm_municip, p.uf || p.sigla_uf].filter(Boolean).join(' / '),
          p.area_hecta ? `Área: ${Number(p.area_hecta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : '',
          [p.fase ? `Fase: ${p.fase}` : '', p.capacidade ? `Capacidade: ${p.capacidade} famílias` : ''].filter(Boolean).join(' • '),
        ],
      }),
      card: {
        title: 'Assentamentos da Reforma Agrária (INCRA / Acervo Fundiário)',
        overlapLevel: 'warning',
        overlapStatus: 'ASSENTAMENTO NA ÁREA',
        near: { radiusM: 5000, status: 'PROXIMIDADE (5 km)' },
      },
    },

    embargos_ibama: {
      key: 'embargos_ibama',
      label: 'Áreas Embargadas (IBAMA)',
      sub: 'IBAMA / PAMGIA • termos de embargo oficiais',
      source: 'IBAMA',
      geomType: 'polygon',
      color: '#ef4444',
      legendUrl: 'https://pamgia.ibama.gov.br/server/services/01_Publicacoes_Bases/adm_embargos_ibama_a/MapServer/WMSServer?request=GetLegendGraphic&version=1.3.0&format=image/png&layer=0',
      defaultOn: true,
      proxy: false,
      sources: [
        {
          url: 'https://pamgia.ibama.gov.br/server/services/01_Publicacoes_Bases/adm_embargos_ibama_a/MapServer/WFSServer',
          typeName: 'adm_embargos_ibama_a:base.adm_embargos_ibama_a',
          geom: 'geometry',
          kind: 'polygon',
        },
        {
          url: 'https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/adm_embargos_ibama_a/FeatureServer/0/query',
          typeName: 'adm_embargos_ibama_a',
          geom: 'geometry',
          kind: 'polygon',
          isArcGIS: true,
        }
      ],
      wms: {
        url: 'https://pamgia.ibama.gov.br/server/rest/services/01_Publicacoes_Bases/adm_embargos_ibama_a/MapServer/export',
        layers: '0',
        isArcGIS: true,
      },
      fields: ['num_tad', 'serie_tad', 'num_auto_infracao', 'nome_embargado', 'municipio', 'uf', 'des_tad', 'qtd_area_embargada'],
      describe: (p) => ({
        title: `Embargo IBAMA TAD ${p.num_tad || ''} (Série ${p.serie_tad || ''})`.trim(),
        code: p.num_auto_infracao ? `Auto Infração: ${p.num_auto_infracao}` : '',
        lines: [
          p.nome_embargado ? `Infrator: ${p.nome_embargado}` : '',
          [p.municipio, p.uf].filter(Boolean).join(' / '),
          p.qtd_area_embargada ? `Área: ${Number(p.qtd_area_embargada).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : '',
          (p.des_tad || '').slice(0, 140),
        ],
      }),
      card: {
        title: 'Áreas Embargadas (IBAMA)',
        overlapLevel: 'danger',
        overlapStatus: 'EMBARGO IBAMA ATIVO',
      },
    },
  };

  const ORDER = ['canie', 'iphan', 'rodovias', 'hidrografia', 'uc', 'funai', 'embargos', 'sigef', 'quilombolas', 'assentamentos', 'embargos_ibama'];

  // Todas as camadas agora possuem serviço ativo e funcional
  const PENDING = [];

  const state = { proxy: null };

  // ---------------------------------------------------------------- WFS / ArcGIS REST
  async function wfs(layer, src, params) {
    // Suporte nativo a ArcGIS FeatureServer (como IBAMA PAMGIA)
    if (src.isArcGIS) {
      try {
        let qUrl = `${src.url}?f=geojson&returnGeometry=true&outFields=*&inSR=4326&outSR=4326`;
        if (params.bbox && Array.isArray(params.bbox)) {
          qUrl += `&geometry=${params.bbox.join(',')}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects`;
        }
        if (params.maxFeatures) qUrl += `&resultRecordCount=${params.maxFeatures}`;
        if (params.startIndex) qUrl += `&resultOffset=${params.startIndex}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const resp = await fetch(qUrl, { signal: ctrl.signal });
        clearTimeout(t);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        return { contingency: true, error: err.message, features: [] };
      }
    }

    const body = new URLSearchParams({
      service: 'WFS',
      version: '1.0.0',
      request: 'GetFeature',
      typeName: src.typeName,
      outputFormat: 'application/json',
      ...params,
    }).toString();

    let text = null;

    // 1. Tenta via proxy se a camada exigir ou se houver proxy ativo
    if (layer.proxy && state.proxy) {
      try {
        text = await state.proxy(src.url, body, layer.key);
      } catch (e) {
        console.warn(`[GOV] Proxy falhou para ${layer.key}:`, e);
      }
    }

    let lastError = null;

    // 2. Fetch direto. Corpos longos (polígonos complexos / buffers) estouram o limite de URL do GET,
    //    então nesse caso o POST vem primeiro. Em qualquer falha de um método, o outro é tentado.
    if (!text) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);

      const readBody = async (resp, method) => {
        if (!resp.ok) {
          lastError = `HTTP ${resp.status} (${method})`;
          return null;
        }
        const raw = await resp.text();
        if (raw && !raw.trim().startsWith('<')) return raw;
        if (raw && raw.includes('<ServiceException')) {
          lastError = `ServiceException (${method}): ${raw.replace(/\s+/g, ' ').slice(0, 160)}`;
          console.warn(`[GOV] GeoServer retornou ServiceException em ${method} para ${layer.key}:`, raw.slice(0, 300));
        } else {
          lastError = `resposta não-JSON (${method})`;
        }
        return null;
      };
      const tryGet = async () => {
        try {
          return await readBody(await fetch(`${src.url}?${body}`, { signal: ctrl.signal }), 'GET');
        } catch (e) {
          lastError = `GET: ${e && e.message ? e.message : e}`;
          return null;
        }
      };
      const tryPost = async () => {
        try {
          return await readBody(
            await fetch(src.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body,
              signal: ctrl.signal,
            }),
            'POST'
          );
        } catch (e) {
          lastError = `POST: ${e && e.message ? e.message : e}`;
          return null;
        }
      };

      try {
        if (body.length > 1800) {
          text = (await tryPost()) || (await tryGet());
        } else {
          text = (await tryGet()) || (await tryPost());
        }
      } finally {
        clearTimeout(t);
      }
    }

    // 3. Se ainda não obteve resposta e temos proxy registrado
    if (!text && state.proxy && !layer.proxy) {
      try {
        text = await state.proxy(src.url, body, layer.key);
      } catch (e) {}
    }

    // 4. Se obteve texto, tenta parsear como GeoJSON
    if (text) {
      try {
        const parsed = typeof text === 'string' ? JSON.parse(text) : text;
        if (parsed && (parsed.type === 'FeatureCollection' || Array.isArray(parsed.features))) {
          return parsed;
        }
      } catch (e) {
        console.warn(`[GOV] Falha no parse JSON de ${layer.key}:`, e);
      }
    }

    // 5. Sem resposta utilizável: SINALIZA a falha (contingency). Nunca devolver "vazio" como se fosse
    //    "nada consta" — o chamador converte isso em status INDISPONÍVEL.
    console.warn(`[GOV] ${layer.key}: sem resposta utilizável de ${src.typeName} (${lastError || 'sem detalhe'})`);
    return {
      type: 'FeatureCollection',
      features: [],
      numberMatched: 0,
      totalFeatures: 0,
      contingency: true,
      error: lastError || 'sem resposta do servidor',
    };
  }

  function geomToWkt(geom) {
    if (!geom) return null;
    const type = geom.type;
    const coords = geom.coordinates;
    const fmt = (c) => `${Number(c[0]).toFixed(6)} ${Number(c[1]).toFixed(6)}`;

    if (type === 'Point') return `POINT(${fmt(coords)})`;
    if (type === 'MultiPoint') return `MULTIPOINT(${coords.map((c) => `(${fmt(c)})`).join(',')})`;
    if (type === 'LineString') return `LINESTRING(${coords.map(fmt).join(',')})`;
    if (type === 'MultiLineString') return `MULTILINESTRING(${coords.map((l) => `(${l.map(fmt).join(',')})`).join(',')})`;
    if (type === 'Polygon') return `POLYGON(${coords.map((ring) => `(${ring.map(fmt).join(',')})`).join(',')})`;
    if (type === 'MultiPolygon') return `MULTIPOLYGON(${coords.map((poly) => `(${poly.map((ring) => `(${ring.map(fmt).join(',')})`).join(',')})`).join(',')})`;
    return null;
  }

  function nameOf(layer, props) {
    const d = layer.describe(props);
    return [d.title, d.code ? `(${d.code})` : ''].filter(Boolean).join(' ');
  }

  function calcDistanceM(feature, targetGeom) {
    try {
      if (!feature.geometry) return null;
      const tType = targetGeom.type;
      const fType = feature.geometry.type;

      // Ponto do alvo
      if (tType === 'Point' || tType === 'MultiPoint') {
        const pt = turf.point(tType === 'MultiPoint' ? targetGeom.coordinates[0] : targetGeom.coordinates);
        if (fType.includes('Polygon')) {
          if (turf.booleanPointInPolygon(pt, feature)) return 0;
          return turf.pointToLineDistance(pt, turf.polygonToLine(feature), { units: 'meters' });
        }
        if (fType.includes('Line')) {
          return turf.pointToLineDistance(pt, feature, { units: 'meters' });
        }
        const fPt = turf.point(fType === 'MultiPoint' ? feature.geometry.coordinates[0] : feature.geometry.coordinates);
        return turf.distance(pt, fPt, { units: 'meters' });
      }

      // Linha do alvo
      if (tType.includes('Line')) {
        const line = turf.feature(targetGeom);
        if (fType.includes('Point')) {
          const pt = turf.point(fType === 'MultiPoint' ? feature.geometry.coordinates[0] : feature.geometry.coordinates);
          return turf.pointToLineDistance(pt, line, { units: 'meters' });
        }
        if (fType.includes('Line')) {
          const isects = turf.lineIntersect(line, feature);
          if (isects.features.length) return 0;
          let minDist = Infinity;
          turf.coordEach(feature, (coord) => {
            const d = turf.pointToLineDistance(turf.point(coord), line, { units: 'meters' });
            if (d < minDist) minDist = d;
          });
          return minDist < Infinity ? minDist : null;
        }
        if (fType.includes('Polygon')) {
          const border = turf.polygonToLine(feature);
          const isects = turf.lineIntersect(line, border);
          if (isects.features.length) return 0;
          let minDist = Infinity;
          turf.coordEach(line, (coord) => {
            const d = turf.pointToLineDistance(turf.point(coord), border, { units: 'meters' });
            if (d < minDist) minDist = d;
          });
          return minDist < Infinity ? minDist : null;
        }
      }

      // Polígono do alvo
      if (tType.includes('Polygon')) {
        const poly = turf.feature(targetGeom);
        const polyBorder = turf.polygonToLine(poly);
        if (fType.includes('Point')) {
          const pt = turf.point(fType === 'MultiPoint' ? feature.geometry.coordinates[0] : feature.geometry.coordinates);
          if (turf.booleanPointInPolygon(pt, poly)) return 0;
          return turf.pointToLineDistance(pt, polyBorder, { units: 'meters' });
        }
        if (fType.includes('Line')) {
          const isects = turf.lineIntersect(polyBorder, feature);
          if (isects.features.length) return 0;
          let minDist = Infinity;
          turf.coordEach(feature, (coord) => {
            const d = turf.pointToLineDistance(turf.point(coord), polyBorder, { units: 'meters' });
            if (d < minDist) minDist = d;
          });
          return minDist < Infinity ? minDist : null;
        }
        if (fType.includes('Polygon')) {
          const fBorder = turf.polygonToLine(feature);
          const isects = turf.lineIntersect(polyBorder, fBorder);
          if (isects.features.length) return 0;
          let minDist = Infinity;
          turf.coordEach(feature, (coord) => {
            const d = turf.pointToLineDistance(turf.point(coord), polyBorder, { units: 'meters' });
            if (d < minDist) minDist = d;
          });
          return minDist < Infinity ? minDist : null;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- Análise Espacial de uma Camada Oficial
  // MOTOR TOPOLÓGICO (v3) — regras universais:
  //  * buffer_m = 0  -> interseção ESTRITA (sem tolerância) entre a geometria do projeto e a feição oficial.
  //  * buffer_m > 0  -> gera máscara geodésica (turf.buffer); testa toque direto E ocorrência dentro do raio.
  //  * Todas as feições retornadas pelo WFS são iteradas (com paginação); nenhuma é descartada em silêncio.
  //  * Falha de servidor NUNCA vira "nada consta": vira erro (status INDISPONÍVEL).

  // ---- Fase 1: sanitização da geometria do usuário ----
  function closeRing(ring) {
    if (!ring || ring.length < 3) return ring;
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return ring.concat([[a[0], a[1]]]);
    return ring;
  }

  function sanitizeGeometry(geom) {
    if (!geom) return geom;
    let g = JSON.parse(JSON.stringify(geom));
    // c) primeiro e último vértice dos anéis fecham perfeitamente
    try {
      if (g.type === 'Polygon') g.coordinates = g.coordinates.map(closeRing);
      else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map((p) => p.map(closeRing));
    } catch (e) {}
    // a) remove vértices duplicados
    try {
      const cleaned = turf.cleanCoords(turf.feature(g));
      if (cleaned && cleaned.geometry) g = cleaned.geometry;
    } catch (e) {
      console.warn('[GOV] cleanCoords falhou (geometria mantida):', e);
    }
    // b) orientação dos anéis
    try {
      if (g.type.includes('Polygon')) {
        const rw = turf.rewind(turf.feature(g), { reverse: true });
        if (rw && rw.geometry) g = rw.geometry;
      }
    } catch (e) {
      console.warn('[GOV] rewind falhou (geometria mantida):', e);
    }
    return g;
  }

  function countVertices(feat) {
    try {
      return turf.coordAll(feat).length;
    } catch (e) {
      return 0;
    }
  }

  function lightSimplify(feat, tolerance) {
    try {
      const s = turf.simplify(feat, { tolerance, highQuality: false, mutate: false });
      if (s && s.geometry && countVertices(s) >= 2) return s;
    } catch (e) {}
    return feat;
  }

  // Simplifica APENAS a geometria enviada ao WFS (URL/corpo menores). A classificação local usa a geometria original.
  function simplifyForQuery(geom) {
    try {
      if (!geom.type.includes('Polygon') && !geom.type.includes('Line')) return geom;
      const feat = turf.feature(geom);
      if (countVertices(feat) <= 400) return geom;
      return lightSimplify(feat, 0.00002).geometry;
    } catch (e) {
      return geom;
    }
  }

  function buildSearchMask(targetFeat, bufferM) {
    const m = turf.buffer(targetFeat, bufferM, { units: 'meters', steps: 32 });
    if (!m || !m.geometry) throw new Error('turf.buffer não retornou geometria');
    return turf.feature(sanitizeGeometry(m.geometry));
  }

  function partsOf(geomOrFeat) {
    const f = geomOrFeat.type === 'Feature' ? geomOrFeat : turf.feature(geomOrFeat);
    try {
      return turf.flatten(f).features;
    } catch (e) {
      return [f];
    }
  }

  function polygonBorders(polyFeat) {
    const out = [];
    partsOf(polyFeat).forEach((p) => {
      try {
        const b = turf.polygonToLine(p);
        if (b.type === 'FeatureCollection') b.features.forEach((x) => out.push(x));
        else out.push(b);
      } catch (e) {}
    });
    return out;
  }

  function pointCoordsOf(geom) {
    const out = [];
    try {
      turf.coordEach(turf.feature(geom), (c) => out.push([c[0], c[1]]));
    } catch (e) {}
    return out;
  }

  function safeIntersects(a, b) {
    try {
      return !!turf.booleanIntersects(a, b);
    } catch (e) {
      return null; // topologia falhou: o chamador decide de forma conservadora (nunca descarta)
    }
  }

  const coordStr = (label, c) => `${label}: Lat ${c[1].toFixed(5)}°, Lon ${c[0].toFixed(5)}°`;

  // Extensão (m) de uma linha que está DENTRO de um polígono (lineSplit nas bordas + teste do ponto médio)
  function lengthInsidePolygon(lineFeat, polyFeat) {
    let pieces = [lineFeat];
    polygonBorders(polyFeat).forEach((border) => {
      const next = [];
      pieces.forEach((pc) => {
        try {
          const sp = turf.lineSplit(pc, border);
          if (sp && sp.features.length) sp.features.forEach((x) => next.push(x));
          else next.push(pc);
        } catch (e) {
          next.push(pc);
        }
      });
      pieces = next;
    });
    let total = 0;
    pieces.forEach((pc) => {
      try {
        const len = turf.length(pc, { units: 'meters' });
        if (!(len > 0)) return;
        const mid = turf.along(pc, turf.length(pc) / 2);
        if (turf.booleanPointInPolygon(mid, polyFeat)) total += len;
      } catch (e) {}
    });
    return total;
  }

  // Menor distância (m) entre duas geometrias quaisquer (inclui Multi*), simétrica
  function minDistanceM(targetGeom, fFeat) {
    let best = null;
    const consider = (d) => {
      if (d != null && isFinite(d) && (best === null || d < best)) best = d;
    };
    partsOf(targetGeom).forEach((tp) => {
      partsOf(fFeat).forEach((fpRaw) => {
        const fp = countVertices(fpRaw) > 4000 ? lightSimplify(fpRaw, 0.0001) : fpRaw;
        consider(calcDistanceM(fp, tp.geometry));
        consider(calcDistanceM(tp, fp.geometry));
      });
    });
    return best;
  }

  async function analyzeLayer(layer, inputFeature, simBufferM) {
    // REGRA ABSOLUTA DO RAIO: nunca ignorado. 0/ausente => interseção estrita.
    const bufferM = Number(simBufferM) > 0 ? Number(simBufferM) : 0;
    const res = {
      key: layer.key,
      overlap: [],
      near: [],
      intersections: [],      // Coordenadas exatas das interseções
      internalLengthM: 0,     // Extensão em metros dentro do polígono ou da diretriz
      overlapAreaHa: 0,       // Área sobreposta em hectares (Polígono vs Polígono)
      overlapAreaPct: 0,      // Percentual sobreposto em relação ao imóvel
      overlapTotal: 0,
      nearTotal: 0,
      simBufferM: bufferM,
      radiusM: bufferM,
      returnedTotal: 0,       // Total de feições devolvidas pelo WFS (diagnóstico)
      partial: false,
      error: null,
    };

    const rawGeom = inputFeature && inputFeature.geometry;
    if (!rawGeom) {
      res.error = 'Geometria inválida ou não suportada';
      return res;
    }

    // ---- Fase 1: sanitização ----
    const geom = sanitizeGeometry(rawGeom);
    const targetFeat = turf.feature(geom);
    const isTargetLine = geom.type.includes('Line');
    const isTargetPoint = geom.type.includes('Point');
    const isTargetPoly = geom.type.includes('Polygon');
    const tPts = isTargetPoint ? pointCoordsOf(geom) : [];
    let targetAreaHa = 0;
    try {
      targetAreaHa = isTargetPoly ? turf.area(targetFeat) / 10000 : 0;
    } catch (e) {}

    // ---- Buffer geodésico (máscara de busca) ----
    let maskFeat = null;
    if (bufferM > 0) {
      try {
        maskFeat = buildSearchMask(targetFeat, bufferM);
      } catch (e) {
        res.error = `Falha ao gerar o buffer de ${bufferM} m: ${e && e.message ? e.message : e}`;
        console.warn(`[GOV] ${layer.label}: ${res.error}`);
        return res;
      }
    }

    // ---- Fase 2: consulta WFS (INTERSECTS com a geometria do projeto OU com a máscara do buffer) ----
    const queryGeom = maskFeat ? maskFeat.geometry : geom;
    const wkt = geomToWkt(simplifyForQuery(queryGeom));
    if (!wkt) {
      res.error = 'Geometria inválida ou não suportada';
      return res;
    }

    const addIsect = (f, fProps, label, c) =>
      res.intersections.push({ featureId: f.id, name: nameOf(layer, fProps), coordStr: coordStr(label, c), lat: c[1], lon: c[0] });

    // ---- Fase 3: classificação topológica de UMA feição oficial ----
    const processFeature = (f) => {
      const fProps = f.properties || {};
      const fGeom = f.geometry;

      // Sem geometria local: nunca descartar. A interseção foi confirmada pelo próprio servidor.
      if (!fGeom) {
        (bufferM > 0 ? res.near : res.overlap).push({ props: fProps, id: f.id, distM: null, geom: null, clippedGeom: null });
        return;
      }

      const fKind = fGeom.type.includes('Point') ? 'point' : fGeom.type.includes('Line') ? 'line' : 'polygon';
      const fCoords = fKind === 'point' ? pointCoordsOf(fGeom) : [];
      const pointCoord = fCoords.length ? coordStr('Coordenada', fCoords[0]) : null;

      // Toque direto (estrito) com a geometria do projeto
      let direct = safeIntersects(targetFeat, f);
      if (direct === null) direct = bufferM === 0; // topologia falhou: confia no INTERSECTS do servidor
      // Dentro do raio (somente se buffer > 0)
      let inMask = direct;
      if (!direct && bufferM > 0) {
        inMask = safeIntersects(maskFeat, f);
        if (inMask === null) inMask = true;
      }
      if (!direct && !inMask) return;

      // Geometria recortada (para exportação KML/SHP): feição ∩ (buffer, ou o próprio polígono do projeto)
      let clippedGeom = null;
      if (fKind === 'polygon') {
        try {
          const clipper = maskFeat || (isTargetPoly ? targetFeat : null);
          if (clipper) {
            const c = turf.intersect(clipper, f);
            if (c && c.geometry) clippedGeom = c.geometry;
          }
        } catch (e) {}
      }

      if (!direct) {
        // Ocorrência dentro do raio parametrizado, sem tocar a geometria do projeto
        res.near.push({ props: fProps, id: f.id, distM: minDistanceM(geom, f), pointCoord, geom: fGeom, clippedGeom });
        return;
      }

      // ===== Toque direto: métricas por combinação de geometrias =====
      if (isTargetPoint) {
        const label = fKind === 'point' ? 'Coordenada' : fKind === 'line' ? 'Eixo incidente' : 'Ponto inserido na área';
        tPts.forEach((c) => {
          if (safeIntersects(turf.point(c), f) !== false) addIsect(f, fProps, label, c);
        });
      } else if (isTargetLine) {
        if (fKind === 'point') {
          // LINHA vs PONTO
          let n = 0;
          fCoords.forEach((c) => {
            if (safeIntersects(targetFeat, turf.point(c)) !== false) {
              addIsect(f, fProps, 'Coordenada', c);
              n++;
            }
          });
          if (!n && fCoords.length) addIsect(f, fProps, 'Coordenada', fCoords[0]);
        } else if (fKind === 'line') {
          // LINHA vs LINHA: cruzamento de eixos
          let n = 0;
          try {
            turf.lineIntersect(targetFeat, f).features.forEach((pt) => {
              addIsect(f, fProps, 'Cruzamento de eixos', pt.geometry.coordinates);
              n++;
            });
          } catch (e) {}
          if (!n) {
            const first = pointCoordsOf(fGeom)[0];
            if (first) addIsect(f, fProps, 'Trecho coincidente', first);
          }
        } else {
          // LINHA vs POLÍGONO: pontos de entrada/saída (divisa oficial) + extensão interna
          partsOf(f).forEach((poly) => {
            polygonBorders(poly).forEach((border) => {
              try {
                turf.lineIntersect(targetFeat, border).features.forEach((pt) => addIsect(f, fProps, 'Divisa oficial', pt.geometry.coordinates));
              } catch (e) {}
            });
            partsOf(targetFeat).forEach((lineFeat) => {
              res.internalLengthM += lengthInsidePolygon(lineFeat, poly);
            });
          });
        }
      } else if (isTargetPoly) {
        if (fKind === 'point') {
          // POLÍGONO vs PONTO: todos os pontos (Multi*) dentro do polígono
          fCoords.forEach((c) => {
            if (safeIntersects(targetFeat, turf.point(c)) !== false) addIsect(f, fProps, 'Coordenada', c);
          });
        } else if (fKind === 'line') {
          // POLÍGONO vs LINHA: travessias nas divisas + extensão interna
          let n = 0;
          const borders = polygonBorders(targetFeat);
          partsOf(f).forEach((lineFeat) => {
            borders.forEach((border) => {
              try {
                turf.lineIntersect(border, lineFeat).features.forEach((pt) => {
                  addIsect(f, fProps, 'Coordenada', pt.geometry.coordinates);
                  n++;
                });
              } catch (e) {}
            });
            partsOf(targetFeat).forEach((poly) => {
              res.internalLengthM += lengthInsidePolygon(lineFeat, poly);
            });
          });
          if (!n) {
            const all = pointCoordsOf(fGeom);
            if (all.length) addIsect(f, fProps, 'Coordenada interna', all[Math.floor(all.length / 2)]);
          }
        } else {
          // POLÍGONO vs POLÍGONO: área exata da sobreposição (ha) + divisas confrontantes
          try {
            const isect = turf.intersect(targetFeat, f);
            if (isect) res.overlapAreaHa += turf.area(isect) / 10000;
          } catch (e) {
            console.warn(`[GOV] ${layer.label}: turf.intersect falhou para feição ${f.id}:`, e);
          }
          try {
            const bT = polygonBorders(targetFeat);
            const bG = polygonBorders(f);
            bT.forEach((a) =>
              bG.forEach((b) => {
                try {
                  turf.lineIntersect(a, b).features.forEach((pt) => addIsect(f, fProps, 'Divisa confrontante', pt.geometry.coordinates));
                } catch (e) {}
              })
            );
          } catch (e) {}
        }
      }

      res.overlap.push({ props: fProps, id: f.id, distM: 0, pointCoord, geom: fGeom, clippedGeom });
    };

    const targetBbox = turf.bbox(maskFeat ? maskFeat : targetFeat);
    const seen = new Set();
    const srcErrors = [];
    const PAGE = 200;
    const MAX_PAGES = 5;

    for (const src of layer.sources) {
      try {
        // A geometria SEMPRE é solicitada: sem ela não há topologia local (e a feição seria descartada).
        const fieldsToReq = src.fields || layer.fields;
        const reqProps = fieldsToReq.concat([src.geom]).join(',');
        const filterCql = `INTERSECTS(${src.geom},${wkt})`;

        // Itera TODAS as feições (paginação até MAX_PAGES * PAGE)
        let all = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const params = { maxFeatures: PAGE, propertyName: reqProps, cql_filter: filterCql, bbox: targetBbox };
          if (page > 0) params.startIndex = page * PAGE;
          const r = await wfs(layer, src, params);
          if (r.contingency) {
            if (page === 0) throw new Error(`fonte oficial sem resposta (${src.typeName}${r.error ? ': ' + r.error : ''})`);
            res.partial = true;
            console.warn(`[GOV] ${layer.label}: falha ao paginar ${src.typeName} (página ${page + 1}); resultado parcial.`);
            break;
          }
          const got = r.features || [];
          all = all.concat(got);
          if (got.length < PAGE) break;
          if (page === MAX_PAGES - 1) res.partial = true; // havia mais registros além do limite
        }
        res.returnedTotal += all.length;

        all.forEach((f, idx) => {
          const key = `${src.typeName}:${f.id != null ? f.id : JSON.stringify(f.properties || {}) + '#' + idx}`;
          if (seen.has(key)) return;
          seen.add(key);
          try {
            processFeature(f);
          } catch (e) {
            // Falha inesperada em UMA feição nunca derruba nem apaga o cruzamento: registra de forma conservadora
            console.warn(`[GOV] ${layer.label}: erro ao processar feição ${f.id}:`, e);
            (bufferM > 0 ? res.near : res.overlap).push({ props: f.properties || {}, id: f.id, distM: null, geom: f.geometry || null, clippedGeom: null });
          }
        });
      } catch (e) {
        srcErrors.push(e && e.message ? e.message : String(e));
      }
    }

    if (srcErrors.length === layer.sources.length) res.error = srcErrors[0];
    else if (srcErrors.length) res.partial = true; // fonte secundária indisponível

    res.overlapTotal = res.overlap.length;
    res.nearTotal = res.near.length;
    if (isTargetPoly && res.overlapAreaHa > 0 && targetAreaHa > 0) {
      res.overlapAreaPct = Math.min(100, (res.overlapAreaHa / targetAreaHa) * 100);
    }

    console.log(
      `[GOV] Camada: ${layer.label} | Raio: ${bufferM} m | WFS retornou: ${res.returnedTotal} feição(ões) | ` +
        `Com incidência: ${res.overlapTotal} | Dentro do raio: ${res.nearTotal}` +
        `${res.partial ? ' | PARCIAL' : ''}${res.error ? ' | ERRO: ' + res.error : ''}`
    );
    return res;
  }

  function buildCard(layer, r) {
    const c = layer.card;
    const base = { key: layer.key, base: c.title, source: layer.source };
    if (r.error) {
      return {
        ...base,
        result: 'Fonte oficial indisponível no momento',
        detail: `Não foi possível consultar ${layer.source}: ${r.error}. O resultado NÃO deve ser lido como "nada consta".`,
        status: 'INDISPONÍVEL',
        level: 'unknown',
        count: 0,
        items: [],
        intersections: [],
      };
    }

    const names = (arr) => arr.slice(0, 3).map((i) => nameOf(layer, i.props));
    const partialNote = r.partial ? ' • Atenção: resultado parcial (limite de paginação ou fonte secundária indisponível) — reconsulte.' : '';

    // Formatação de notas regulatórias confiáveis (sem adivinhar APP ou faixa de domínio arbitrária)
    let regulatoryNote = '';
    if (layer.key === 'hidrografia') {
      regulatoryNote = ' • Nota técnica: Incidência de curso d\'água oficial (Lei 12.651/2012 - Código Florestal). A APP deve ser delimitada a partir da calha regular determinada em campo.';
    } else if (layer.key === 'rodovias') {
      regulatoryNote = ' • Nota técnica: Interseção com rodovia oficial. Necessária certidão de Faixa de Domínio e autorização de acesso junto ao DNIT/órgão competente.';
    }

    // Se houve simulação paramétrica informada pelo usuário
    let simNote = '';
    if (r.simBufferM > 0 && r.overlapTotal > 0) {
      simNote = ` • Faixa simulada de ${r.simBufferM} m sob premissa técnica declarada do usuário.`;
    }

    if (r.overlapTotal > 0) {
      const level = typeof c.overlapLevel === 'function' ? c.overlapLevel(r.overlap) : c.overlapLevel;
      let detailText = names(r.overlap).join(' • ') + (r.overlapTotal > 3 ? ` • +${r.overlapTotal - 3}` : '');

      // Se temos coordenadas exatas de interseção, exibe as primeiras com destaque
      if (r.intersections && r.intersections.length) {
        const coordsSummary = r.intersections.slice(0, 2).map((pt) => pt.coordStr).join('; ');
        detailText = `Cruzamento identificado na ${coordsSummary}${r.intersections.length > 2 ? ` (+${r.intersections.length - 2} cruzamentos)` : ''} • ` + detailText;
      }

      let resultText = `${r.overlapTotal} feição(ões) incidente(s) na camada`;
      if (r.overlapAreaHa > 0) {
        const areaStr = Number(r.overlapAreaHa).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
        const pctStr = r.overlapAreaPct > 0 ? ` (${r.overlapAreaPct.toFixed(1)}% do imóvel)` : '';
        resultText = `${r.overlapTotal} feição(ões) incidente(s) • ${areaStr} ha sobrepostos${pctStr}`;
      } else if (r.internalLengthM > 0) {
        resultText = `${r.overlapTotal} feição(ões) incidente(s) • ${km(Math.round(r.internalLengthM))} de extensão incidente`;
      }
      if (r.nearTotal > 0) resultText += ` • +${r.nearTotal} no raio de ${km(r.radiusM)}`;

      return {
        ...base,
        result: resultText,
        detail: detailText + regulatoryNote + simNote + partialNote,
        status: c.overlapStatus,
        level,
        count: r.overlapTotal,
        intersections: r.intersections || [],
        items: r.overlap.map((i) => layer.describe(i.props)),
        features: r.overlap || [],
        nearFeatures: r.near || [],
      };
    }

    if (r.nearTotal > 0) {
      const radiusM = r.radiusM || r.simBufferM || 0;
      const withDist = r.near
        .filter((i) => i.distM != null)
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 3)
        .map((i) => {
          const nm = nameOf(layer, i.props);
          const coord = i.pointCoord ? ` (${i.pointCoord})` : '';
          return `${nm} — ${Math.round(i.distM)} m${coord}`;
        });
      return {
        ...base,
        result: `Sem sobreposição • ${r.nearTotal} no raio de ${km(radiusM)}`,
        detail: (withDist.length ? withDist : names(r.near)).join(' • ') + ` • Raio de análise definido pelo usuário: ${km(radiusM)}` + partialNote,
        status: `RAIO ${km(radiusM)}`,
        level: 'warning',
        count: r.nearTotal,
        intersections: [],
        items: r.near.map((i) => layer.describe(i.props)),
        features: [],
        nearFeatures: r.near || [],
      };
    }

    const radiusM = r.radiusM || r.simBufferM || 0;
    return {
      ...base,
      result: radiusM > 0 ? `Sem sobreposição e nada no raio de ${km(radiusM)}` : 'Sem incidência na camada',
      detail: `Consulta ao vivo na base ${layer.source}${radiusM > 0 ? ` (raio de busca de ${km(radiusM)} parametrizado pelo usuário)` : ' (interseção estrita com a geometria do projeto)'}.` + partialNote,
      status: 'NADA CONSTA',
      level: 'ok',
      count: 0,
      intersections: [],
      items: [],
      features: [],
      nearFeatures: [],
    };
  }

  async function crossing(inputFeature, keys, simBufferM) {
    const feat = inputFeature;
    const bufferM = Number(simBufferM) > 0 ? Number(simBufferM) : 0;
    const geom = feat && feat.geometry ? feat.geometry : feat;

    // 1. Tenta executar via PostGIS / Supabase (zero latência, zero falsos negativos, cálculo em microssegundos)
    const CFG = window.PANORAMA_CONFIG || {};
    if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && geom) {
      try {
        const sbClient = window.supabaseClient || window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        console.log(`[GOV] Solicitando análise espacial via PostGIS RPC (raio: ${bufferM} m)...`);
        const { data, error } = await sbClient.rpc('analyze_project', {
          p_geom: geom,
          p_buffer_m: bufferM,
        });

        if (!error && data && data.ok && Array.isArray(data.cards) && data.cards.length > 0) {
          console.log(`[GOV] Análise espacial concluída via PostGIS com sucesso (${data.cards.length} camadas analisadas no banco).`);
          const filteredCards = (keys && keys.length ? keys : ORDER)
            .map((k) => data.cards.find((c) => c.key === k))
            .filter(Boolean)
            .map((r) => buildCard(LAYERS[r.key], r));
          if (filteredCards.length) return filteredCards;
        } else if (error) {
          console.warn('[GOV] PostGIS RPC retornou aviso/erro (acionando fallback local WFS):', error.message);
        }
      } catch (err) {
        console.warn('[GOV] Falha ao comunicar com PostGIS RPC (acionando fallback local WFS):', err);
      }
    }

    // 2. Fallback: motor WFS / Turf client-side com sanitização universal e paginação
    // A simplificação (se necessária) agora ocorre SOMENTE na geometria enviada ao WFS, dentro de analyzeLayer.
    // A topologia local usa a geometria original do usuário (áreas e interseções exatas).
    const use = (keys && keys.length ? keys : ORDER).map((k) => LAYERS[k]).filter(Boolean);
    const results = await Promise.all(use.map((l) => analyzeLayer(l, feat, simBufferM)));
    return results.map((r) => buildCard(LAYERS[r.key], r));
  }

  // ---------------------------------------------------------------- Identificação por clique
  async function identify(latlng, zoom, keys) {
    const mPerPx = (156543.03 * Math.cos((latlng.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    const tol = Math.max(5, Math.round(mPerPx * 10));
    const pt = `POINT(${latlng.lng.toFixed(6)} ${latlng.lat.toFixed(6)})`;
    const jobs = keys
      .map((k) => LAYERS[k])
      .filter(Boolean)
      .map(async (layer) => {
        const found = [];
        try {
          for (const src of layer.sources) {
            const reqFields = (src.fields || layer.fields).join(',');
            const r = await wfs(layer, src, {
              maxFeatures: 5,
              propertyName: reqFields,
              cql_filter: `DWITHIN(${src.geom},${pt},${tol},meters)`,
            });
            (r.features || []).forEach((f) => found.push(layer.describe(f.properties || {})));
          }
        } catch (e) {
          return { layer, found: [], error: e.message };
        }
        return { layer, found };
      });
    return Promise.all(jobs);
  }

  async function ping(key) {
    const layer = LAYERS[key];
    const t0 = performance.now();
    try {
      await wfs(layer, layer.sources[0], { maxFeatures: 1, propertyName: layer.fields[0] });
      return { key, ok: true, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { key, ok: false, error: e.message };
    }
  }

  function wmsLayer(key) {
    const l = LAYERS[key];
    if (l.wms.isArcGIS) {
      const EsriTileLayer = L.TileLayer.extend({
        getTileUrl: function (coords) {
          const nw = this._map.unproject(coords.scaleBy(this.getTileSize()), coords.z);
          const se = this._map.unproject(coords.add([1, 1]).scaleBy(this.getTileSize()), coords.z);
          return `${l.wms.url}?bbox=${nw.lng},${se.lat},${se.lng},${nw.lat}&bboxSR=4326&imageSR=4326&size=256,256&format=png32&transparent=true&f=image`;
        },
      });
      return new EsriTileLayer('', { opacity: 0.85, maxZoom: 19 });
    }
    const opts = {
      layers: l.wms.layers,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.85,
      maxZoom: 19,
    };
    if (key === 'funai') {
      opts.className = 'funai-wms-layer';
    }
    return L.tileLayer.wms(l.wms.url, opts);
  }

  window.GOV = { LAYERS, ORDER, PENDING, crossing, identify, ping, wmsLayer, setProxy: (fn) => (state.proxy = fn) };
})();
