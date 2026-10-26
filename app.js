// ============================================================================
// PANORAMA GIS — Ampliando a Visão do seu Negócio
// Acesso (Supabase Auth) • Perfis admin/consultoria • Planos e acessos simultâneos •
// Projetos reais • Cruzamento ao vivo com as bases oficiais (govlayers.js)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UNLIMITED = 999999;
  const maxLabel = (n) => (n >= UNLIMITED ? 'Ilimitados' : n);

  // ---------------------------------------------------------------- Supabase
  const CFG = window.PANORAMA_CONFIG || window.CONFIG || {};
  const sbUrl = CFG.SUPABASE_URL || CFG.supabaseUrl;
  const sbKey = CFG.SUPABASE_ANON_KEY || CFG.supabaseAnonKey;
  const configured = !!(sbUrl && sbKey && !sbUrl.includes('SEU_PROJETO') && window.supabase);
  const sb = configured ? window.supabase.createClient(sbUrl, sbKey) : null;
  window.supabaseClient = sb;
  if (!configured) $('config-warning')?.classList.remove('hidden');

  // ---------------------------------------------------------------- Estado
  const sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
  let profile = null; // linha de profiles
  let consultancy = null; // linha de consultancies (somente consultoria)
  let plans = {};
  let plan = null;
  let projects = [];
  let currentProject = null; // linha do banco (ou projeto compartilhado)
  let currentRing = null; // [[lat,lng],...] sem fechar
  let currentCards = null;
  let sharedBrand = null;
  let isSharedPortal = false;
  let isClientPortalMode = false;
  let isDrawingMode = false;
  let drawGeometryType = 'Polygon'; // 'Polygon' | 'LineString' | 'Point'
  let isCommentMode = false;
  let drawPoints = [];
  let tempDrawMarkers = [];
  let tempDrawPolyline = null;
  let heartbeat = null;
  let pendingLogo = null;
  let projectLayers = [];       // Até 5 camadas do projeto ativo
  let activeLayerIndex = 0;     // Camada ativa no painel de diagnóstico
  const LAYER_PALETTE = ['#10B981', '#06b6d4', '#f59e0b', '#a855f7', '#f43f5e'];

  // ---------------------------------------------------------------- Toast
  let toastTimeout;
  function showToast(msg) {
    $('toast-message').textContent = msg;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('toast').classList.add('hidden'), 4500);
  }

  // ---------------------------------------------------------------- Mapa
  const map = L.map('map', { 
    center: [-14.2, -51.9], 
    zoom: 4, 
    zoomControl: false,
    tap: true,
    touchZoom: true
  });
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // ResizeObserver & Debounced InvalidateSize para evitar gray tiles do Leaflet
  const mapContainer = document.getElementById('map');
  if (mapContainer && window.ResizeObserver) {
    let resizeTimer = null;
    const mapResizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          map.invalidateSize({ pan: false });
        } catch (e) {}
      }, 100);
    });
    mapResizeObserver.observe(mapContainer);
  } else {
    window.addEventListener('resize', () => {
      setTimeout(() => {
        try { map.invalidateSize(); } catch (e) {}
      }, 150);
    });
  }

  // ---------------------------------------------------------------- Controle de Gavetas / Painéis Mobile (Drawer)
  const leftSidebar = document.getElementById('left-sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const drawerBackdrop = document.getElementById('webgis-drawer-backdrop');
  const btnToggleLayersMobile = document.getElementById('btn-toggle-layers-mobile');
  const btnToggleDiagnosisMobile = document.getElementById('btn-toggle-diagnosis-mobile');
  const btnCloseLeftDrawer = document.getElementById('btn-close-left-drawer');
  const btnCloseRightDrawer = document.getElementById('btn-close-right-drawer');

  function closeAllDrawers() {
    leftSidebar?.classList.remove('drawer-open');
    rightSidebar?.classList.remove('drawer-open');
    drawerBackdrop?.classList.add('hidden');
    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) {}
    }, 320);
  }

  btnToggleLayersMobile?.addEventListener('click', () => {
    rightSidebar?.classList.remove('drawer-open');
    const isOpen = leftSidebar?.classList.toggle('drawer-open');
    if (isOpen) {
      drawerBackdrop?.classList.remove('hidden');
    } else {
      drawerBackdrop?.classList.add('hidden');
    }
    setTimeout(() => map.invalidateSize(), 320);
  });

  btnToggleDiagnosisMobile?.addEventListener('click', () => {
    leftSidebar?.classList.remove('drawer-open');
    const isOpen = rightSidebar?.classList.toggle('drawer-open');
    if (isOpen) {
      drawerBackdrop?.classList.remove('hidden');
    } else {
      drawerBackdrop?.classList.add('hidden');
    }
    setTimeout(() => map.invalidateSize(), 320);
  });

  btnCloseLeftDrawer?.addEventListener('click', closeAllDrawers);
  btnCloseRightDrawer?.addEventListener('click', closeAllDrawers);
  drawerBackdrop?.addEventListener('click', closeAllDrawers);

  const basemaps = {
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenTopoMap contributors',
      maxZoom: 17,
    }),
  };
  // ---------------------------------------------------------------- Basemap state and switcher
  let activeBasemap = 'satellite';

  function setBasemap(key) {
    if (!basemaps[key]) return;
    activeBasemap = key;
    Object.values(basemaps).forEach((bm) => {
      if (map.hasLayer(bm)) {
        map.removeLayer(bm);
      }
    });
    basemaps[activeBasemap].addTo(map);

    document.querySelectorAll('.basemap-btn').forEach((btn) => {
      const bKey = btn.getAttribute('data-basemap');
      if (bKey === activeBasemap) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  const layerGroups = {
    buffer_analysis: L.featureGroup().addTo(map),
    perimetro: L.featureGroup().addTo(map),
    user_comments: L.featureGroup().addTo(map),
    measure: L.featureGroup().addTo(map),
  };

  document.querySelectorAll('.basemap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-basemap');
      if (target) setBasemap(target);
    });
  });

  // Inicializacao do basemap e sincronizacao da UI no mount
  setBasemap('satellite');

  // ---------------------------------------------------------------- Camadas oficiais (WMS ao vivo)
  const govMaps = {};
  const govList = $('gov-layers-list');

  function setBadge(key, text, level) {
    const el = $(`badge-layer-${key}`);
    if (!el) return;
    el.textContent = text;
    const cls = {
      danger: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
      warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      ok: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
      unknown: 'bg-slate-700/60 text-slate-300 border border-slate-600',
      idle: 'bg-slate-800 text-slate-500 border border-slate-700',
    }[level || 'idle'];
    el.className = `text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`;
  }

  // ---------------------------------------------------------------- Symbology Cartográfica (Ponto, Linha, Polígono, Buffer)
  function getSymbologySwatch(geomType, color, isHatch, size = 'sm') {
    if (isHatch) {
      const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
      return `<span class="${dim} rounded-sm shrink-0 border border-rose-500 hatch-swatch-red inline-block shadow-sm" title="Simbologia: Raio Hachurado"></span>`;
    }

    const type = String(geomType || '').toLowerCase();

    // 1. PONTO: Círculo com borda branca brilhante (exatamente como L.circleMarker no mapa)
    if (type.includes('point') || type.includes('ponto')) {
      const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
      const inner = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
      return `<span class="${dim} flex items-center justify-center shrink-0" title="Simbologia: Ponto"><span class="${inner} rounded-full border-2 border-white shadow-sm inline-block shrink-0" style="background-color: ${color};"></span></span>`;
    }

    // 2. LINHA: Traço horizontal com espessura proporcional (exatamente como L.polyline de rodovias e hidrografia no mapa)
    if (type.includes('line') || type.includes('linha')) {
      const dim = size === 'sm' ? 'w-4 h-3.5' : 'w-4 h-4';
      return `<span class="${dim} flex items-center justify-center shrink-0" title="Simbologia: Linha"><span class="w-full h-[3.5px] rounded-full shadow-sm inline-block" style="background-color: ${color};"></span></span>`;
    }

    // 3. POLÍGONO: Área com borda colorida sólida e preenchimento suave translúcido (exatamente como L.polygon no mapa)
    const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    return `<span class="${dim} rounded-sm flex items-center justify-center shrink-0 border-2 shadow-sm inline-block" style="border-color: ${color}; background-color: ${color}33;" title="Simbologia: Polígono"></span>`;
  }

  function buildGovLayerList() {
    govList.innerHTML = '';
    GOV.ORDER.forEach((key) => {
      const l = GOV.LAYERS[key];
      const row = document.createElement('label');
      row.className =
        'flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition';
      row.innerHTML = `
        <div class="flex items-center gap-2.5">
          <input type="checkbox" data-gov="${key}" ${l.defaultOn !== false ? 'checked' : ''} class="accent-[#00A0FF] w-3.5 h-3.5 rounded cursor-pointer" />
          ${getSymbologySwatch(l.geomType, l.color, false, 'sm')}
          <div>
            <div class="text-xs font-medium text-slate-200">${esc(l.label)}</div>
            <div class="text-[10px] text-slate-500">${esc(l.sub)}</div>
          </div>
        </div>
        <span id="badge-layer-${key}" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">—</span>`;
      govList.appendChild(row);

      const cb = row.querySelector('input');
      govMaps[key] = GOV.wmsLayer(key);
      if (l.defaultOn !== false) govMaps[key].addTo(map);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          govMaps[key].addTo(map);
        } else {
          map.removeLayer(govMaps[key]);
        }
        updateMapLegend();
      });
    });

    GOV.PENDING.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2 rounded-lg bg-[#1E293B] border border-white/[0.08] opacity-80';
      row.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="w-3.5 h-3.5 inline-block"></span>
          <span class="w-3 h-3 rounded-sm border-2 border-slate-600 inline-block"></span>
          <div>
            <div class="text-xs font-medium text-slate-400">${esc(p.label)}</div>
            <div class="text-[10px] text-slate-500">${esc(p.sub)}</div>
          </div>
        </div>
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">EM INTEGRAÇÃO</span>`;
      govList.appendChild(row);
    });
  }
  buildGovLayerList();
  updateMapLegend();

  document.querySelectorAll('.layer-toggle[data-layer="perimetro"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        map.addLayer(layerGroups.perimetro);
      } else {
        map.removeLayer(layerGroups.perimetro);
      }
      updateMapLegend();
    });
  });

  // Identificar feições por clique
  function visibleGovKeys() {
    return GOV.ORDER.filter((k) => {
      const cb = document.querySelector(`input[data-gov="${k}"]`);
      if (!cb || !cb.checked) return false;
      return true;
    });
  }

  async function identifyAt(latlng) {
    const keys = visibleGovKeys();
    if (!keys.length) return;
    const popup = L.popup({ maxWidth: 340 }).setLatLng(latlng).setContent('<div class="text-xs p-1">Consultando bases oficiais…</div>').openOn(map);
    const results = await GOV.identify(latlng, map.getZoom(), keys);
    let html = '<div class="p-1 space-y-2" style="max-height:260px;overflow:auto">';
    let any = false;
    results.forEach((r) => {
      if (r.error) {
        html += `<div class="text-[10px] text-slate-400">${esc(r.layer.source)}: indisponível (${esc(r.error)})</div>`;
        return;
      }
      r.found.forEach((d) => {
        any = true;
        html += `<div class="border-l-2 pl-2" style="border-color:${r.layer.color}">
          <div class="text-[10px] font-bold uppercase" style="color:${r.layer.color}">${esc(r.layer.label)}</div>
          <div class="text-xs font-bold text-white">${esc(d.title)}</div>
          ${d.code ? `<div class="text-[11px] font-mono text-slate-300">${esc(d.code)}</div>` : ''}
          ${(d.lines || []).filter(Boolean).map((x) => `<div class="text-[11px] text-slate-300">${esc(x)}</div>`).join('')}
        </div>`;
      });
    });
    if (!any) html += '<div class="text-xs text-slate-300">Nenhuma feição oficial neste ponto.</div>';
    html += `<div class="text-[10px] font-mono text-[#00A0FF]">${latlng.lat.toFixed(5)}°, ${latlng.lng.toFixed(5)}°</div></div>`;
    popup.setContent(html);
  }

  // ---------------------------------------------------------------- Geometria
  function ringToPolygon(ring) {
    const c = ring.map((p) => [p[1], p[0]]);
    if (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1]) c.push([...c[0]]);
    return turf.polygon([c]);
  }
  function polygonToRing(geometry) {
    return geometry.coordinates[0].slice(0, -1).map((c) => [c[1], c[0]]);
  }
  function metricsOf(ring) {
    const poly = ringToPolygon(ring);
    return {
      poly,
      areaHa: turf.area(poly) / 10000,
      perimKm: turf.length(poly, { units: 'kilometers' }),
      vertices: ring.length,
    };
  }
  const fmt = (n, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

  function largestRing(polys) {
    // polys: array de arrays de [lng,lat] (anel externo)
    let best = null;
    let bestArea = -1;
    polys.forEach((r) => {
      const closed = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
      const ring = closed ? r : [...r, r[0]];
      try {
        const a = turf.area(turf.polygon([ring]));
        if (a > bestArea) {
          bestArea = a;
          best = ring;
        }
      } catch (e) {}
    });
    return best ? best.slice(0, -1).map((c) => [c[1], c[0]]) : null;
  }

  function parseKml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const rings = [];
    Array.from(doc.getElementsByTagName('Polygon')).forEach((pg) => {
      const outer = pg.getElementsByTagName('outerBoundaryIs')[0];
      const coords = outer && outer.getElementsByTagName('coordinates')[0];
      if (!coords) return;
      const ring = coords.textContent
        .trim()
        .split(/\s+/)
        .map((t) => t.split(',').map(parseFloat))
        .filter((p) => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
        .map((p) => [p[0], p[1]]);
      if (ring.length >= 3) rings.push(ring);
    });
    return largestRing(rings);
  }

  function extractFeatureFromKml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');

    // 1. Polígono
    const polys = Array.from(doc.getElementsByTagName('Polygon'));
    if (polys.length) {
      const ring = parseKml(text);
      if (ring) {
        const poly = ringToPolygon(ring);
        return { geom_type: 'Polygon', geometry: poly.geometry };
      }
    }

    // 2. Linha
    const lines = Array.from(doc.getElementsByTagName('LineString'));
    if (lines.length) {
      const coordsEl = lines[0].getElementsByTagName('coordinates')[0];
      if (coordsEl) {
        const pts = coordsEl.textContent
          .trim()
          .split(/\s+/)
          .map((t) => t.split(',').map(parseFloat))
          .filter((p) => p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
          .map((p) => [p[0], p[1]]);
        if (pts.length >= 2) {
          return { geom_type: 'LineString', geometry: { type: 'LineString', coordinates: pts } };
        }
      }
    }

    // 3. Ponto
    const points = Array.from(doc.getElementsByTagName('Point'));
    if (points.length) {
      const coordsEl = points[0].getElementsByTagName('coordinates')[0];
      if (coordsEl) {
        const pt = coordsEl.textContent.trim().split(',').map(parseFloat);
        if (pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])) {
          return { geom_type: 'Point', geometry: { type: 'Point', coordinates: [pt[0], pt[1]] } };
        }
      }
    }
    return null;
  }

  function extractFeatureFromGeoJSON(gj) {
    let found = null;
    const walk = (g) => {
      if (!g || found) return;
      if (Array.isArray(g)) return g.forEach(walk);
      const feats = g.type === 'FeatureCollection' ? g.features : [g];
      feats.forEach((f) => {
        if (found) return;
        const geom = f.type === 'Feature' ? f.geometry : f;
        if (!geom) return;
        if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          found = { geom_type: 'Polygon', geometry: geom };
        } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
          found = { geom_type: 'LineString', geometry: geom };
        } else if (geom.type === 'Point' || geom.type === 'MultiPoint') {
          found = { geom_type: 'Point', geometry: geom };
        }
      });
    };
    walk(gj);
    return found;
  }

  // ---------------------------------------------------------------- Cartões de cruzamento
  function renderCards(cards, pending) {
    const container = $('diagnosis-cards-container');
    if (!container) return;
    container.innerHTML = '';
    if (pending) {
      container.innerHTML = `<div class="p-4 rounded-xl bg-slate-800/50 border border-slate-700/70 text-xs text-slate-300 animate-pulse">${esc(pending)}</div>`;
      return;
    }
    if (!cards || !cards.length) {
      container.innerHTML = `<div class="p-4 rounded-xl bg-slate-800/40 border border-dashed border-slate-700 text-xs text-slate-400 leading-relaxed">
        Nenhum cruzamento ainda. Importe um <strong>KML/Shapefile</strong> ou <strong>desenhe a área</strong> no mapa para consultar as bases oficiais ao vivo.</div>`;
      return;
    }
    const style = {
      ok: ['bg-emerald-500/15 text-emerald-400 border-emerald-500/30', 'border-l-emerald-500'],
      warning: ['bg-amber-500/20 text-amber-300 border-amber-500/30', 'border-l-amber-500'],
      danger: ['bg-rose-500/20 text-rose-400 border-rose-500/30', 'border-l-rose-500'],
      unknown: ['bg-slate-600/30 text-slate-300 border-slate-500/40', 'border-l-slate-500'],
    };
    cards.forEach((c) => {
      const [badge, border] = style[c.level] || style.ok;
      const el = document.createElement('div');
      el.className = `p-3 rounded-xl bg-slate-800/50 border border-slate-700/70 border-l-4 ${border} space-y-1 transition hover:bg-slate-800`;
      el.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-slate-100">${esc(c.base)}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${badge} shrink-0">${esc(c.status)}</span>
        </div>
        <div class="text-xs font-medium text-slate-300">${esc(c.result)}</div>
        <div class="text-[11px] text-slate-400">${esc(c.detail)}</div>`;
      container.appendChild(el);
    });
  }

  function badgesFromCards(cards) {
    GOV.ORDER.forEach((k) => setBadge(k, '—', 'idle'));
    (cards || []).forEach((c) => {
      const txt = c.level === 'ok' ? 'OK' : c.level === 'unknown' ? 'ERRO' : c.count > 0 ? String(c.count) : 'ALERTA';
      setBadge(c.key, txt, c.level);
    });
  }

  function summarize(cards) {
    if (!cards || !cards.length) return 'Sem análise ainda.';
    const bad = cards.filter((c) => c.level === 'danger');
    const warn = cards.filter((c) => c.level === 'warning');
    const unk = cards.filter((c) => c.level === 'unknown');
    const parts = [];
    if (bad.length) parts.push(`<strong>Restrições oficiais identificadas:</strong> ${bad.map((c) => `${esc(c.base)} — ${esc(c.result)}`).join('; ')}.`);
    if (warn.length) parts.push(`<strong>Pontos de atenção:</strong> ${warn.map((c) => `${esc(c.base)} — ${esc(c.result)}`).join('; ')}.`);
    if (unk.length) parts.push(`<strong>Fontes indisponíveis na consulta:</strong> ${unk.map((c) => esc(c.base)).join(', ')} (reconsulte antes de concluir).`);
    if (!parts.length) parts.push('Nenhuma sobreposição ou proximidade encontrada nas bases oficiais consultadas.');
    return parts.join('<br/><br/>');
  }

  function renderRisk(cards) {
    const el = $('overall-risk-badge');
    if (!el) return;
    let cls = 'bg-slate-700/40 border-slate-600 text-slate-300';
    let icon = 'minus-circle';
    let label = 'Sem análise';
    if (cards && cards.length) {
      if (cards.some((c) => c.level === 'danger')) [cls, icon, label] = ['bg-rose-500/15 border-rose-500/40 text-rose-300', 'shield-alert', 'Restrição oficial'];
      else if (cards.some((c) => c.level === 'unknown')) [cls, icon, label] = ['bg-slate-600/30 border-slate-500/40 text-slate-200', 'help-circle', 'Análise incompleta'];
      else if (cards.some((c) => c.level === 'warning')) [cls, icon, label] = ['bg-amber-500/15 border-amber-500/40 text-amber-300', 'alert-triangle', 'Exige atenção'];
      else [cls, icon, label] = ['bg-[#00A0FF]/15 border-[#00A0FF]/40 text-[#00A0FF]', 'shield-check', 'Nada consta'];
    }
    el.className = `px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 shrink-0 ${cls}`;
    el.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5"></i> ${label}`;
  }

  function setKpis(ring, cards) {
    if (!ring) {
      ['kpi-area', 'kpi-perimeter', 'kpi-vertices', 'kpi-rl'].forEach((i) => { if ($(i)) $(i).textContent = '—'; });
      if ($('layer-area-badge')) $('layer-area-badge').textContent = '—';
      if ($('kpi-modulos')) $('kpi-modulos').textContent = currentProject?.municipality || '—';
      return;
    }
    const m = metricsOf(ring);
    if ($('kpi-area')) $('kpi-area').textContent = `${fmt(m.areaHa)} ha`;
    if ($('kpi-perimeter')) $('kpi-perimeter').textContent = `${fmt(m.perimeterKm, 2)} km`;
    if ($('kpi-vertices')) $('kpi-vertices').textContent = `${ring.length} pts`;
    if ($('layer-area-badge')) $('layer-area-badge').textContent = `${fmt(m.areaHa)} ha`;
    if ($('kpi-modulos')) $('kpi-modulos').textContent = currentProject?.municipality || '—';
    if ($('kpi-rl')) {
      const rlHa = m.areaHa * 0.2;
      $('kpi-rl').textContent = `${fmt(rlHa)} ha (20%)`;
    }
  }

  // ---------------------------------------------------------------- GESTÃO DE CAMADAS DO PROJETO (Até 5 camadas)
  function renderProjectLayersUI() {
    const list = $('project-layers-list');
    const badge = $('layers-quota-badge');
    if (!list) return;

    const count = projectLayers.length;
    if (badge) {
      badge.textContent = `${count} / 5`;
      badge.className = `text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
        count >= 5 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      }`;
    }

    const runAllBtn = $('btn-run-all-analysis');
    if (runAllBtn && !isClientPortalMode) {
      if (!count) {
        runAllBtn.classList.add('opacity-40', 'pointer-events-none');
      } else {
        runAllBtn.classList.remove('opacity-40', 'pointer-events-none');
      }
    }

    if (!count) {
      list.innerHTML = `<div class="p-3 rounded-lg border border-dashed border-slate-700 text-xs text-slate-400 text-center">
        Nenhuma camada adicionada. Importe ou desenhe acima (até 5 camadas).
      </div>`;
      return;
    }

    list.innerHTML = '';
    projectLayers.forEach((lyr, idx) => {
      const isSelected = idx === activeLayerIndex;
      const el = document.createElement('div');
      el.className = `p-2.5 rounded-lg border transition space-y-2 ${
        isSelected
          ? 'bg-[#1E293B] border-emerald-500/50 shadow-md ring-1 ring-emerald-500/40'
          : 'bg-[#1E293B]/70 hover:bg-[#1E293B] border-white/[0.08]'
      }`;

      // Geometry icon & label
      let icon = 'pentagon';
      let geomLabel = 'Polígono';
      let metricStr = '—';
      if (lyr.geom_type.includes('Line')) {
        icon = 'spline';
        geomLabel = 'Linha';
        const lenM = lyr.metrics?.length_m || 0;
        metricStr = `${(lenM / 1000).toFixed(2).replace('.', ',')} km`;
      } else if (lyr.geom_type.includes('Point')) {
        icon = 'map-pin';
        geomLabel = 'Ponto';
        metricStr = 'Ponto';
      } else {
        const ha = lyr.metrics?.area_ha || 0;
        metricStr = `${ha.toFixed(1).replace('.', ',')} ha`;
      }

      el.innerHTML = `
        <!-- Row 1: Layer Icon, Name and Actions (Visibility, Color, Delete) -->
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-2 min-w-0 cursor-pointer flex-1" data-select-layer="${idx}">
            <span class="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
              ${getSymbologySwatch(lyr.geom_type, lyr.color, false, 'sm')}
            </span>
            <span class="text-xs font-semibold text-slate-200 truncate" title="${esc(lyr.name)}">${esc(lyr.name)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button data-toggle-vis="${idx}" class="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer" title="${lyr.visible ? 'Ocultar camada no mapa' : 'Mostrar camada no mapa'}">
              <i data-lucide="${lyr.visible ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>
            </button>
            <button data-change-color="${idx}" class="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 cursor-pointer" style="background-color: ${lyr.color}" title="Alterar cor"></button>
            <button data-delete-layer="${idx}" class="p-1 rounded text-slate-500 hover:text-rose-400 transition cursor-pointer" title="Excluir camada">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Row 2: Metric (Area/Length) on left and [▶ Analisar] Button on right (Matching Paint Sketch) -->
        <div class="flex items-center justify-between text-xs pt-0.5">
          <span class="font-mono text-[11px] text-slate-300 font-medium">${geomLabel} • ${metricStr}</span>
          <button data-run-layer="${idx}" class="btn-ase-primary shrink-0 text-[11px] px-3 py-1 rounded-lg flex items-center gap-1.5 active:scale-95 group" title="Executar cruzamento socioambiental desta camada">
            <i data-lucide="play" class="w-3 h-3 fill-white text-white shrink-0 group-hover:scale-110 transition-transform"></i> <span>Analisar</span>
          </button>
        </div>

        <!-- Row 3: Dedicated Buffer / Radius Control (Matching Paint Sketch) -->
        <div class="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2 text-[11px]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-slate-300 text-xs font-semibold whitespace-nowrap" title="Definir raio de análise em metros (opcional)">Definir raio (m):</span>
            <input 
              type="number" 
              data-buffer-input="${idx}" 
              value="${lyr.simulated_buffer_m !== null && lyr.simulated_buffer_m !== undefined ? lyr.simulated_buffer_m : 0}" 
              placeholder="0" 
              min="0" 
              step="100" 
              class="w-[56px] bg-slate-900 border border-slate-600/70 focus:border-emerald-500 rounded px-1.5 py-0.5 text-xs font-mono text-emerald-400 text-center focus:outline-none transition" 
              title="Distância do raio em metros (ex: 500, 1000, 2500, 5000)"
            />
          </div>
          <label class="flex items-center gap-1.5 cursor-pointer select-none shrink-0 group text-[10px] font-semibold text-slate-300 hover:text-white transition ml-2" title="Exibir/Ocultar raio hachurado no mapa">
            <span class="w-3 h-3 rounded-sm border border-rose-500 hatch-swatch-red inline-block shadow-sm shrink-0" title="Simbologia do raio no mapa"></span>
            <span class="whitespace-nowrap">Ver no Mapa</span>
            <input 
              type="checkbox" 
              data-toggle-buffer="${idx}" 
              ${lyr.show_buffer !== false ? 'checked' : ''} 
              class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500" 
            />
          </label>
        </div>
      `;

      el.querySelector(`[data-select-layer="${idx}"]`).addEventListener('click', () => {
        activeLayerIndex = idx;
        renderProjectLayersUI();
        displayActiveLayerAnalysis();
      });

      el.querySelector(`[data-toggle-vis="${idx}"]`).addEventListener('click', (e) => {
        e.stopPropagation();
        lyr.visible = !lyr.visible;
        renderLayersOnMap();
        renderProjectLayersUI();
        if (sb && lyr.id && !String(lyr.id).startsWith('temp_')) {
          sb.from('project_layers').update({ visible: lyr.visible }).eq('id', lyr.id);
        }
      });

      el.querySelector(`[data-change-color="${idx}"]`).addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = LAYER_PALETTE.indexOf(lyr.color);
        const nextColor = LAYER_PALETTE[(curIdx + 1) % LAYER_PALETTE.length];
        lyr.color = nextColor;
        renderLayersOnMap();
        renderProjectLayersUI();
        updateMapLegend();
        if (sb && lyr.id && !String(lyr.id).startsWith('temp_')) {
          sb.from('project_layers').update({ color: nextColor }).eq('id', lyr.id);
        }
      });

      const bufferInput = el.querySelector(`[data-buffer-input="${idx}"]`);
      if (bufferInput) {
        bufferInput.addEventListener('click', (e) => e.stopPropagation());
        bufferInput.addEventListener('change', async (e) => {
          e.stopPropagation();
          const val = parseFloat(e.target.value);
          const oldVal = lyr.simulated_buffer_m;
          let safeVal = !isNaN(val) && val >= 0 ? val : 0;

          // Regra de Buffer PANORAMA GIS:
          // Iniciante: até 5.000m (5 km)
          // Profissional / Padrão: até 10.000m (10 km)
          const isIni = plan?.id === 'iniciante' || plan?.id === 'essencial';
          const maxBufferM = isIni ? 5000 : 10000;
          if (safeVal > maxBufferM) {
            safeVal = maxBufferM;
            e.target.value = safeVal;
            showToast(isIni 
              ? 'No Plano Iniciante o buffer máximo é de 5 km (5.000m). Para buffers de até 10 km, ative o Profissional.' 
              : 'O buffer regulatório máximo de análise é de até 10 km (10.000m).');
          }

          lyr.simulated_buffer_m = safeVal;
          if (lyr.simulated_buffer_m > 0 && lyr.show_buffer === false) {
            lyr.show_buffer = true;
          }
          renderLayersOnMap();
          renderProjectLayersUI();
          updateMapLegend();
          if (sb && lyr.id && !String(lyr.id).startsWith('temp_')) {
            await sb.from('project_layers').update({ simulated_buffer_m: lyr.simulated_buffer_m }).eq('id', lyr.id);
          }
          if (lyr.simulated_buffer_m !== oldVal) {
            showToast(`Raio da camada "${lyr.name}" ajustado para ${lyr.simulated_buffer_m || 0}m.`);
            await runLayerAnalysis(idx);
          }
        });
      }

      const toggleCheck = el.querySelector(`[data-toggle-buffer="${idx}"]`);
      if (toggleCheck) {
        toggleCheck.addEventListener('click', (e) => e.stopPropagation());
        toggleCheck.addEventListener('change', (e) => {
          e.stopPropagation();
          lyr.show_buffer = e.target.checked;
          if (lyr.show_buffer && (lyr.simulated_buffer_m === null || lyr.simulated_buffer_m === undefined)) {
            lyr.simulated_buffer_m = 0;
            renderProjectLayersUI();
          }
          renderLayersOnMap();
          updateMapLegend();
          showToast(lyr.show_buffer ? (lyr.simulated_buffer_m > 0 ? `Raio (${lyr.simulated_buffer_m}m) exibido no mapa.` : 'Defina um raio maior que 0m para visualizar a área de amortecimento.') : 'Raio de análise ocultado no mapa.');
        });
      }

      el.querySelector(`[data-run-layer="${idx}"]`).addEventListener('click', async (e) => {
        e.stopPropagation();
        await runLayerAnalysis(idx);
      });

      el.querySelector(`[data-delete-layer="${idx}"]`).addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Deseja excluir a camada "${lyr.name}"?`)) return;
        await deleteProjectLayer(idx);
      });

      list.appendChild(el);
    });

    lucide.createIcons();
    updateMapLegend();
  }
  function ensureHatchPattern() {
    const mapSvg = document.querySelector('#map svg');
    if (!mapSvg) return;
    if (mapSvg.querySelector('#red-hatch')) return;

    let defs = mapSvg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      mapSvg.insertBefore(defs, mapSvg.firstChild);
    }

    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'red-hatch');
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');
    pattern.setAttribute('patternTransform', 'rotate(45 0 0)');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '10');
    bg.setAttribute('height', '10');
    bg.setAttribute('fill', '#ef4444');
    bg.setAttribute('fill-opacity', '0.12');
    pattern.appendChild(bg);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '0');
    line.setAttribute('y2', '10');
    line.setAttribute('stroke', '#ef4444');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-opacity', '0.85');
    pattern.appendChild(line);

    defs.appendChild(pattern);
  }

  function renderLayersOnMap() {
    ensureHatchPattern();
    layerGroups.perimetro.clearLayers();
    layerGroups.buffer_analysis.clearLayers();
    if (!projectLayers.length) return;

    // OrdenaÃ§Ã£o cartogrÃ¡fica de renderizaÃ§Ã£o no mapa:
    // PolÃ­gonos no fundo (1), Linhas no meio (2), Pontos no topo (3)
    const mapStackWeight = (geom) => {
      if (!geom) return 1;
      const t = String(geom.type || '');
      if (t.includes('Point')) return 3;
      if (t.includes('Line')) return 2;
      return 1;
    };

    const sortedLayers = [...projectLayers]
      .map((lyr, idx) => ({ lyr, idx }))
      .sort((a, b) => mapStackWeight(a.lyr.geometry) - mapStackWeight(b.lyr.geometry));

    sortedLayers.forEach(({ lyr, idx }) => {
      if (!lyr.visible || !lyr.geometry) return;
      const geom = lyr.geometry;

      // 1. Camada do Raio de Análise (Temporária / Sob Demanda) com contorno sólido e hachura vermelha
      if (lyr.simulated_buffer_m && lyr.simulated_buffer_m > 0 && lyr.show_buffer !== false && typeof turf !== 'undefined') {
        try {
          const feat = turf.feature(geom);
          const bufferKm = lyr.simulated_buffer_m / 1000;
          const buffered = turf.buffer(feat, bufferKm, { units: 'kilometers' });

          if (buffered && buffered.geometry) {
            const bufferAreaHa = turf.area(buffered) / 10000;
            const isPoly = lyr.geom_type.includes('Polygon');
            const isLine = lyr.geom_type.includes('Line');
            const labelType = isPoly ? 'Raio de Análise / Amortecimento' : isLine ? 'Faixa de Servidão Paramétrica' : 'Raio de Influência';

            const bufferLeaflet = L.geoJSON(buffered, {
              className: 'leaflet-buffer-hatch',
              style: {
                color: '#ef4444',
                weight: 2.5,
                opacity: 1,
                fillColor: '#ef4444',
                fillOpacity: 0.15,
              },
            });

            bufferLeaflet.bindPopup(`
              <div class="p-1 space-y-1.5">
                <div class="flex items-center gap-1.5 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <span class="w-3 h-3 rounded-sm border border-rose-500 inline-block hatch-swatch-red"></span>
                  <span>${labelType}</span>
                </div>
                <div class="text-base font-black font-mono text-white">${lyr.simulated_buffer_m.toLocaleString('pt-BR')} metros</div>
                <div class="text-xs text-slate-300">Camada de origem: <strong class="text-white">${esc(lyr.name)}</strong></div>
                <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-700/60 font-mono">
                  Área total abrangida: <strong class="text-rose-300">${bufferAreaHa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ha</strong>
                </div>
              </div>
            `);

            layerGroups.buffer_analysis.addLayer(bufferLeaflet);
          }
        } catch (err) {
          console.warn('Erro ao processar buffer da camada:', err);
        }
      }

      // 2. Geometria Principal (Polígono, Linha ou Ponto)
      let leafletLayer = null;

      if (geom.type.includes('Polygon')) {
        leafletLayer = L.geoJSON(geom, {
          style: {
            color: lyr.color,
            weight: idx === activeLayerIndex ? 3 : 2,
            fillColor: lyr.color,
            fillOpacity: 0.15,
          },
        });
      } else if (geom.type.includes('Line')) {
        leafletLayer = L.geoJSON(geom, {
          style: {
            color: lyr.color,
            weight: idx === activeLayerIndex ? 4 : 3,
            opacity: 0.9,
          },
        });
      } else if (geom.type.includes('Point')) {
        leafletLayer = L.geoJSON(geom, {
          pointToLayer: (gjPt, latlng) =>
            L.circleMarker(latlng, {
              radius: idx === activeLayerIndex ? 8 : 6,
              fillColor: lyr.color,
              color: '#ffffff',
              weight: 2,
              fillOpacity: 0.95,
            }),
        });
      }

      if (leafletLayer) {
        leafletLayer.bindPopup(`
          <div class="p-1 space-y-1">
            <div class="text-[10px] font-bold uppercase tracking-wider" style="color: ${lyr.color}">${esc(lyr.geom_type)}</div>
            <div class="text-xs font-bold text-white">${esc(lyr.name)}</div>
            ${lyr.simulated_buffer_m ? `<div class="text-[10px] text-emerald-400">Faixa simulada: ${lyr.simulated_buffer_m}m</div>` : ''}
          </div>
        `);
        layerGroups.perimetro.addLayer(leafletLayer);
      }
    });

    if (layerGroups.perimetro.getLayers().length) {
      try {
        const bounds = layerGroups.perimetro.getBounds();
        if (bounds.isValid()) {
          if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
            map.setView(bounds.getCenter(), 14);
          } else {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
          }
        }
      } catch (e) {}
    }
    updateMapLegend();
  }

  function displayActiveLayerAnalysis() {
    const lyr = projectLayers[activeLayerIndex];
    if (!lyr) {
      renderCards(null);
      renderRisk(null);
      setKpis(null);
      return;
    }

    const cards = lyr.analysis?.cards || null;
    currentCards = cards;
    renderCards(cards);
    renderRisk(cards);
    badgesFromCards(cards);

    // KPIs
    if (lyr.geom_type.includes('Polygon')) {
      const ha = lyr.metrics?.area_ha || 0;
      $('kpi-area').textContent = `${fmt(ha)} ha`;
      $('kpi-modulos').textContent = currentProject?.municipality || '—';
      $('kpi-perimeter').textContent = lyr.metrics?.perimeter_km ? `${fmt(lyr.metrics.perimeter_km, 2)} km` : '—';
      if ($('layer-area-badge')) $('layer-area-badge').textContent = `${fmt(ha)} ha`;
    } else if (lyr.geom_type.includes('Line')) {
      const lenKm = (lyr.metrics?.length_m || 0) / 1000;
      $('kpi-area').textContent = lyr.simulated_buffer_m ? `${lyr.simulated_buffer_m}m faixa` : 'Linear';
      $('kpi-modulos').textContent = currentProject?.municipality || '—';
      $('kpi-perimeter').textContent = `${fmt(lenKm, 2)} km`;
      if ($('layer-area-badge')) $('layer-area-badge').textContent = `${fmt(lenKm, 2)} km`;
    } else {
      $('kpi-area').textContent = lyr.simulated_buffer_m ? `${lyr.simulated_buffer_m}m raio` : 'Pontual';
      $('kpi-modulos').textContent = currentProject?.municipality || '—';
      const ptCoords = lyr.geometry?.type === 'Point' ? lyr.geometry.coordinates : null;
      $('kpi-perimeter').textContent = lyr.metrics?.lat ? `${lyr.metrics.lat.toFixed(4)}°, ${lyr.metrics.lon.toFixed(4)}°` : (ptCoords ? `${ptCoords[1].toFixed(4)}°, ${ptCoords[0].toFixed(4)}°` : '—');
      if ($('layer-area-badge')) $('layer-area-badge').textContent = lyr.simulated_buffer_m ? `Raio ${lyr.simulated_buffer_m}m` : 'Ponto';
    }
  }

  async function runLayerAnalysis(idx) {
    const lyr = projectLayers[idx];
    if (!lyr || !lyr.geometry) return;

    activeLayerIndex = idx;
    renderProjectLayersUI();
    renderCards(null, `Consultando bases oficiais para "${lyr.name}"…`);

    const feat = turf.feature(lyr.geometry);
    const cards = await GOV.crossing(feat, null, lyr.simulated_buffer_m);
    const at = new Date().toISOString();

    lyr.analysis = { cards, at };
    lyr.analysis_at = at;

    displayActiveLayerAnalysis();

    if (sb && lyr.id && !String(lyr.id).startsWith('temp_') && !isSharedPortal) {
      const { error } = await sb.from('project_layers').update({
        analysis: lyr.analysis,
        analysis_at: at,
      }).eq('id', lyr.id);
      if (error) {
        showToast('Cruzamento concluído, mas erro ao salvar: ' + error.message);
      } else {
        showToast(`Análise de "${lyr.name}" concluída e salva.`);
      }
    } else {
      showToast(`Análise de "${lyr.name}" concluída.`);
    }
  }

  async function addProjectLayer(layerObj) {
    const isMaster = profile?.role === 'master' || (profile?.role === 'admin' && !profile?.consultancy_id);
    if (!isMaster && profile?.consultancy_id && !currentProject) {
      showToast('Cadastre ou selecione um projeto antes (botão "Área da Consultoria").');
      return;
    }

    // Regra PANORAMA GIS: 1 camada ativa por vez (ao adicionar uma nova, a anterior é apagada para análise focada)
    if (projectLayers.length > 0) {
      if (sb && currentProject && !isSharedPortal) {
        for (const oldLyr of projectLayers) {
          if (oldLyr.id && !String(oldLyr.id).startsWith('temp_')) {
            await sb.from('project_layers').delete().eq('id', oldLyr.id);
          }
        }
      }
      projectLayers = [];
      activeLayerIndex = 0;
      if (layerGroups.buffer_analysis) layerGroups.buffer_analysis.clearLayers();
    }

    const color = LAYER_PALETTE[0];
    const newLyr = {
      project_id: currentProject ? currentProject.id : null,
      name: layerObj.name || `Camada Principal`,
      geom_type: layerObj.geom_type,
      geometry: layerObj.geometry,
      color: color,
      visible: true,
      simulated_buffer_m: null,
      metrics: layerObj.metrics || {},
    };

    if (sb && currentProject && !isSharedPortal) {
      const { data, error } = await sb.from('project_layers').insert(newLyr).select().single();
      if (error) {
        showToast('Erro ao gravar camada: ' + error.message);
        return;
      }
      projectLayers.push(data);
    } else {
      newLyr.id = 'temp_' + Date.now();
      projectLayers.push(newLyr);
    }

    activeLayerIndex = 0;
    renderLayersOnMap();
    renderProjectLayersUI();
    showToast(`Camada principal "${newLyr.name}" definida. Executando cruzamento oficial…`);
    await runLayerAnalysis(activeLayerIndex);
  }

  async function deleteProjectLayer(idx) {
    const lyr = projectLayers[idx];
    if (!lyr) return;

    if (sb && lyr.id && !String(lyr.id).startsWith('temp_')) {
      const { error } = await sb.from('project_layers').delete().eq('id', lyr.id);
      if (error) return showToast('Erro ao excluir: ' + error.message);
    }
    projectLayers.splice(idx, 1);
    if (activeLayerIndex >= projectLayers.length) {
      activeLayerIndex = Math.max(0, projectLayers.length - 1);
    }
    renderLayersOnMap();
    renderProjectLayersUI();
    displayActiveLayerAnalysis();
    showToast('Camada excluída com sucesso.');
  }

  // ---------------------------------------------------------------- Importar KML / Shapefile / GeoJSON
  const fileInput = $('file-upload');
  fileInput.setAttribute('accept', '.kml,.kmz,.zip,.shp,.geojson,.json');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    fileInput.value = '';
    if (!file) return;

    const name = file.name.toLowerCase();
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    try {
      let extracted = null;
      if (name.endsWith('.kmz')) {
        return showToast('KMZ compactado ainda não é suportado: exporte como KML ou Shapefile (.zip).');
      }

      if (name.endsWith('.zip') || name.endsWith('.shp')) {
        const gj = await window.shp(await file.arrayBuffer());
        extracted = extractFeatureFromGeoJSON(gj);
      } else if (name.endsWith('.geojson') || name.endsWith('.json')) {
        const text = await file.text();
        extracted = extractFeatureFromGeoJSON(JSON.parse(text));
      } else {
        const text = await file.text();
        extracted = extractFeatureFromKml(text);
      }

      if (!extracted || !extracted.geometry) {
        return showToast('Não foi encontrada nenhuma feição geográfica válida no arquivo.');
      }

      // Calcula métricas da geometria
      const metrics = {};
      const g = extracted.geometry;
      if (extracted.geom_type === 'Polygon') {
        const feat = turf.feature(g);
        metrics.area_ha = turf.area(feat) / 10000;
        metrics.perimeter_km = turf.length(feat, { units: 'kilometers' });
      } else if (extracted.geom_type === 'LineString') {
        metrics.length_m = turf.length(turf.feature(g), { units: 'meters' });
      }

      await addProjectLayer({
        name: baseName,
        geom_type: extracted.geom_type,
        geometry: extracted.geometry,
        metrics,
      });
    } catch (err) {
      showToast('Erro ao ler o arquivo: ' + (err.message || 'formato inválido'));
    }
  });

  // ---------------------------------------------------------------- Ferramentas de Desenho (Polígono, Linha, Ponto)
  const drawingHelper = $('drawing-helper');
  const drawInstructions = $('drawing-instructions');

  function startDrawing(type) {
    isDrawingMode = true;
    drawGeometryType = type;
    drawPoints = [];
    clearTempDraw();
    drawingHelper.classList.remove('hidden');
    map.getContainer().style.cursor = 'crosshair';

    if (type === 'Polygon') {
      drawInstructions.innerHTML = '<strong>Desenho de Polígono:</strong> Clique no mapa para marcar os vértices.';
    } else if (type === 'LineString') {
      drawInstructions.innerHTML = '<strong>Desenho de Linha:</strong> Clique no mapa para traçar a diretriz.';
    } else {
      drawInstructions.innerHTML = '<strong>Marcação de Ponto:</strong> Clique no local exato do ponto no mapa.';
    }
    showToast(`Modo desenho ativado: ${type === 'Polygon' ? 'Polígono' : type === 'LineString' ? 'Linha' : 'Ponto'}.`);
  }

  $('btn-draw-polygon')?.addEventListener('click', () => startDrawing('Polygon'));
  $('btn-draw-line')?.addEventListener('click', () => startDrawing('LineString'));
  $('btn-draw-point')?.addEventListener('click', () => startDrawing('Point'));

  function clearTempDraw() {
    tempDrawMarkers.forEach((m) => map.removeLayer(m));
    tempDrawMarkers = [];
    if (tempDrawPolyline) map.removeLayer(tempDrawPolyline);
    tempDrawPolyline = null;
  }

  $('btn-finish-draw')?.addEventListener('click', async () => {
    if (drawGeometryType === 'Polygon') {
      if (drawPoints.length < 3) return showToast('Marque pelo menos 3 vértices para um polígono.');
      const ringCoords = drawPoints.map((p) => [p[1], p[0]]);
      ringCoords.push([...ringCoords[0]]);
      const polyGeom = { type: 'Polygon', coordinates: [ringCoords] };
      const areaHa = turf.area(turf.polygon([ringCoords])) / 10000;
      const perimKm = turf.length(turf.polygon([ringCoords]), { units: 'kilometers' });

      isDrawingMode = false;
      drawingHelper.classList.add('hidden');
      map.getContainer().style.cursor = '';
      clearTempDraw();

      const name = window.prompt('Nome da camada de polígono:', `Perímetro ${projectLayers.length + 1}`) || `Polígono ${projectLayers.length + 1}`;
      await addProjectLayer({
        name,
        geom_type: 'Polygon',
        geometry: polyGeom,
        metrics: { area_ha: areaHa, perimeter_km: perimKm },
      });
    } else if (drawGeometryType === 'LineString') {
      if (drawPoints.length < 2) return showToast('Marque pelo menos 2 pontos para uma linha.');
      const lineCoords = drawPoints.map((p) => [p[1], p[0]]);
      const lineGeom = { type: 'LineString', coordinates: lineCoords };
      const lenM = turf.length(turf.lineString(lineCoords), { units: 'meters' });

      isDrawingMode = false;
      drawingHelper.classList.add('hidden');
      map.getContainer().style.cursor = '';
      clearTempDraw();

      const name = window.prompt('Nome da camada linear / diretriz:', `Traçado ${projectLayers.length + 1}`) || `Linha ${projectLayers.length + 1}`;
      await addProjectLayer({
        name,
        geom_type: 'LineString',
        geometry: lineGeom,
        metrics: { length_m: lenM },
      });
    }
  });

  $('btn-cancel-draw')?.addEventListener('click', () => {
    isDrawingMode = false;
    drawingHelper.classList.add('hidden');
    map.getContainer().style.cursor = '';
    clearTempDraw();
  });

  $('btn-run-all-analysis')?.addEventListener('click', async () => {
    if (!projectLayers.length) return showToast('Nenhuma camada para analisar.');
    const btn = $('btn-run-all-analysis');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-70', 'pointer-events-none');
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin text-[#00A0FF]"></i> <span>Analisando...</span>`;
      if (window.lucide) window.lucide.createIcons();
    }
    try {
    showToast(`Analisando todas as ${projectLayers.length} camadas…`);
    for (let i = 0; i < projectLayers.length; i++) {
      await runLayerAnalysis(i);
    }
      showToast('Cruzamento de todas as camadas concluído com sucesso!');
    } catch (err) {
      console.error('Erro ao analisar todas as camadas:', err);
      showToast('Ocorreu um erro ao processar uma das camadas.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'pointer-events-none');
        btn.innerHTML = oldHtml;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  });

  $('btn-Add-comment')?.addEventListener('click', () => {
    isCommentMode = !isCommentMode;
    $('comment-btn-label').textContent = isCommentMode ? 'Clique no Mapa para Anotar...' : 'Adicionar Nota no Mapa';
    map.getContainer().style.cursor = isCommentMode ? 'pointer' : '';
  });
  $('btn-measure-tool')?.addEventListener('click', () => showToast('Clique em qualquer ponto do mapa para identificar as feições oficiais.'));

  // ---------------------------------------------------------------- Régua de Medição (Distâncias Geodésicas - SIRGAS 2000)
  let isMeasureMode = false;
  let measurePoints = [];
  let measureMarkers = [];
  let measureLine = null;
  let measureGuideLine = null;

  function formatMeasureDist(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
  }

  function getCumulativeDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += points[i - 1].distanceTo(points[i]);
    }
    return total;
  }

  function toggleMeasureRuler(forceState) {
    const newState = typeof forceState === 'boolean' ? forceState : !isMeasureMode;
    if (newState === isMeasureMode) return;

    isMeasureMode = newState;
    const btn = $('btn-measure-ruler');
    const banner = $('measure-banner');

    if (isMeasureMode) {
      if (typeof isDrawingMode !== 'undefined' && isDrawingMode) {
        isDrawingMode = false;
        drawingHelper?.classList.add('hidden');
        clearTempDraw();
      }
      if (typeof isCommentMode !== 'undefined' && isCommentMode) {
        isCommentMode = false;
        if ($('comment-btn-label')) $('comment-btn-label').textContent = 'Adicionar Nota no Mapa';
      }

      map.getContainer().style.cursor = 'crosshair';
      map.doubleClickZoom.disable();
      btn?.classList.add('tool-active');
      btn?.classList.remove('text-slate-300');
      banner?.classList.remove('hidden');
      updateMeasureUI();
      showToast('Régua ativada: clique no mapa para iniciar a medição de distância.');
    } else {
      clearMeasure(true);
      map.getContainer().style.cursor = '';
      map.doubleClickZoom.enable();
      btn?.classList.remove('tool-active');
      btn?.classList.add('text-slate-300');
      banner?.classList.add('hidden');
    }
  }

  function clearMeasure(fullReset) {
    measurePoints = [];
    measureMarkers = [];
    if (measureLine) {
      layerGroups.measure.removeLayer(measureLine);
      measureLine = null;
    }
    if (measureGuideLine) {
      layerGroups.measure.removeLayer(measureGuideLine);
      measureGuideLine = null;
    }
    layerGroups.measure.clearLayers();
    if (!fullReset) {
      updateMeasureUI();
    }
  }

  function updateMeasureUI() {
    const totalMeters = getCumulativeDistance(measurePoints);
    const totalEl = $('measure-total-val');
    const instrEl = $('measure-instructions');
    const finishBtn = $('btn-measure-finish');

    if (totalEl) totalEl.textContent = formatMeasureDist(totalMeters);

    if (measurePoints.length === 0) {
      if (instrEl) instrEl.textContent = 'Clique no mapa para marcar o ponto inicial.';
      finishBtn?.classList.add('hidden');
    } else if (measurePoints.length === 1) {
      if (instrEl) instrEl.textContent = 'Clique para adicionar o próximo ponto ou segmento.';
      finishBtn?.classList.add('hidden');
    } else {
      if (instrEl) instrEl.textContent = 'Clique para mais pontos, ou duplo-clique / Concluir.';
      finishBtn?.classList.remove('hidden');
    }
  }

  function addMeasurePoint(latlng) {
    measurePoints.push(latlng);
    const idx = measurePoints.length;
    const totalMeters = getCumulativeDistance(measurePoints);

    const marker = L.circleMarker(latlng, {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#10B981',
      fillOpacity: 1,
    }).addTo(layerGroups.measure);

    const labelText = idx === 1 ? 'Início (0 m)' : `${idx}: ${formatMeasureDist(totalMeters)}`;
    marker.bindTooltip(labelText, {
      permanent: true,
      direction: 'top',
      offset: [0, -8],
      className: 'measure-vertex-label',
    });
    measureMarkers.push(marker);

    if (measureLine) {
      layerGroups.measure.removeLayer(measureLine);
    }
    if (measurePoints.length > 1) {
      measureLine = L.polyline(measurePoints, {
        color: '#10B981',
        weight: 3.5,
        opacity: 0.95,
      }).addTo(layerGroups.measure);
    }

    updateMeasureUI();
  }

  function finishMeasurement() {
    if (measureGuideLine) {
      layerGroups.measure.removeLayer(measureGuideLine);
      measureGuideLine = null;
    }
    if (measurePoints.length < 2) return;

    const totalMeters = getCumulativeDistance(measurePoints);
    const finishBtn = $('btn-measure-finish');
    const instrEl = $('measure-instructions');
    finishBtn?.classList.add('hidden');

    if (instrEl) {
      instrEl.innerHTML = `<span class="text-[#00A0FF] font-bold">Medição concluída:</span> ${formatMeasureDist(totalMeters)} (${measurePoints.length} vértices).`;
    }

    const lastMarker = measureMarkers[measureMarkers.length - 1];
    if (lastMarker) {
      lastMarker.bindPopup(`
        <div class="p-1 space-y-1">
          <div class="text-[10px] font-bold uppercase text-[#00A0FF] flex items-center gap-1">
            <i data-lucide="ruler" class="w-3.5 h-3.5"></i> Distância Total Medida
          </div>
          <div class="text-base font-extrabold font-mono text-white">${formatMeasureDist(totalMeters)}</div>
          <div class="text-[10px] text-slate-300">${measurePoints.length} vértices • SIRGAS 2000</div>
        </div>
      `).openPopup();
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function handleMeasureMove(latlng) {
    if (!isMeasureMode || measurePoints.length === 0) return;
    const lastPt = measurePoints[measurePoints.length - 1];
    const segDist = lastPt.distanceTo(latlng);
    const totalDist = getCumulativeDistance(measurePoints) + segDist;

    if (!measureGuideLine) {
      measureGuideLine = L.polyline([lastPt, latlng], {
        color: '#10B981',
        weight: 2.5,
        dashArray: '5, 5',
        opacity: 0.8,
      }).addTo(layerGroups.measure);
    } else {
      measureGuideLine.setLatLngs([lastPt, latlng]);
    }

    const totalEl = $('measure-total-val');
    if (totalEl) totalEl.textContent = formatMeasureDist(totalDist);
  }

  $('btn-measure-ruler')?.addEventListener('click', () => toggleMeasureRuler());
  $('btn-measure-finish')?.addEventListener('click', finishMeasurement);
  $('btn-measure-clear')?.addEventListener('click', () => clearMeasure(false));
  $('btn-measure-close')?.addEventListener('click', () => toggleMeasureRuler(false));

  // ---------------------------------------------------------------- Legenda Dinâmica de Camadas Ativas
  function updateMapLegend() {
    const container = $('map-legend-items');
    const badgeBtn = $('legend-btn-badge');
    const badgeCount = $('legend-badge-count');
    if (!container) return;

    const activeItems = [];

    // 1. Camadas do Projeto Ativas
    if (Array.isArray(projectLayers)) {
      projectLayers.forEach((lyr) => {
        if (lyr.visible !== false) {
          const gType = String(lyr.geom_type || lyr.geometry?.type || '').toLowerCase();
          let geomKind = 'polygon';
          let geomLabel = 'PolÃ­gono';
          if (gType.includes('line')) {
            geomKind = 'line';
            geomLabel = 'Linha';
          } else if (gType.includes('point') || gType.includes('ponto')) {
            geomKind = 'point';
            geomLabel = 'Ponto';
          }

          activeItems.push({
            type: 'project',
            geomType: geomKind,
            name: lyr.name || 'Camada do Projeto',
            sub: `Projeto â€¢ ${geomLabel}`,
            color: lyr.color || '#00A0FF',
          });
        }
      });
    }

    // 1.5. Camadas do Raio de AnÃ¡lise / Buffer (TemporÃ¡rias / Sob Demanda)
    if (Array.isArray(projectLayers)) {
      projectLayers.forEach((lyr) => {
        if (lyr.visible !== false && lyr.simulated_buffer_m && lyr.show_buffer !== false) {
          const gType = String(lyr.geom_type || lyr.geometry?.type || '').toLowerCase();
          const isLine = gType.includes('line');
          activeItems.push({
            type: 'buffer',
            geomType: 'buffer',
            name: isLine ? `Faixa: ${lyr.simulated_buffer_m}m` : `Raio: ${lyr.simulated_buffer_m}m`,
            sub: `Zona de AnÃ¡lise â€¢ ${lyr.name}`,
            color: '#ef4444',
            isHatch: true,
          });
        }
      });
    }

    // 2. Bases Governamentais Oficiais Ativas
    if (typeof GOV !== 'undefined' && GOV.ORDER) {
      GOV.ORDER.forEach((key) => {
        const cb = document.querySelector(`input[data-gov="${key}"]`);
        if (cb && cb.checked && GOV.LAYERS[key]) {
          const lyr = GOV.LAYERS[key];
          let geomLabel = lyr.geomType === 'point' ? 'Ponto' : lyr.geomType === 'line' ? 'Linha' : 'PolÃ­gono';
          activeItems.push({
            type: 'gov',
            geomType: lyr.geomType || 'polygon',
            name: lyr.label,
            sub: `${lyr.source || 'Base Oficial'} â€¢ ${geomLabel}`,
            color: lyr.color || '#64748b',
            legendUrl: lyr.legendUrl || null,
          });
        }
      });
    }

    // NOTA: As feiÃ§Ãµes do imÃ³vel e suas geometrias jÃ¡ residem integralmente em projectLayers,
    // eliminando qualquer duplicaÃ§Ã£o ou divergÃªncia de simbologia com o mapa.
    // Badges de contagem
    const totalCount = activeItems.length;
    if (badgeBtn) badgeBtn.textContent = totalCount;
    if (badgeCount) badgeCount.textContent = `${totalCount} ativa${totalCount === 1 ? '' : 's'}`;

    if (totalCount === 0) {
      container.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-800/40 border border-dashed border-slate-700 text-center text-slate-400 space-y-1">
          <i data-lucide="info" class="w-4 h-4 text-slate-500 mx-auto"></i>
          <p class="text-[11px] font-semibold">Nenhuma camada ativada</p>
          <p class="text-[10px] text-slate-500">Marque camadas na barra lateral para visualizÃ¡-las aqui.</p>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // OrdenaÃ§Ã£o estrita cartogrÃ¡fica: Ponto (1), Linha (2), PolÃ­gono (3), Buffer (4)
    const geomWeight = { point: 1, line: 2, polygon: 3, buffer: 4 };
    const projItems = activeItems.filter((i) => i.type === 'project' || i.type === 'perimetro' || i.type === 'buffer');
    const govItems = activeItems.filter((i) => i.type === 'gov');

    projItems.sort((a, b) => (geomWeight[a.geomType] || 3) - (geomWeight[b.geomType] || 3));
    govItems.sort((a, b) => (geomWeight[a.geomType] || 3) - (geomWeight[b.geomType] || 3));

    let html = '';

    if (projItems.length > 0) {
      html += `
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-[#00A0FF] block mb-1.5 flex items-center gap-1">
            <i data-lucide="folder-check" class="w-3 h-3"></i> Camadas do Projeto (${projItems.length})
          </span>
          <div class="space-y-1.5">
            ${projItems
              .map(
                (item) => `
              <div class="flex items-center gap-2.5 p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                ${getSymbologySwatch(item.geomType, item.color, item.isHatch, 'md')}
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-white truncate text-[11px] flex items-center gap-1.5">
                    <span>${esc(item.name)}</span>
                    ${item.isHatch ? `<span class="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase font-mono font-bold">TemporÃ¡ria</span>` : ''}
                  </div>
                  <div class="text-[10px] text-slate-400 truncate">${esc(item.sub)}</div>
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    if (govItems.length > 0) {
      html += `
        <div class="${projItems.length > 0 ? 'pt-2 border-t border-slate-600/50' : ''}">
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1.5 flex items-center gap-1">
            <i data-lucide="shield-alert" class="w-3 h-3"></i> Bases Governamentais (${govItems.length})
          </span>
          <div class="space-y-1.5">
            ${govItems
              .map(
                (item) => `
              <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  ${getSymbologySwatch(item.geomType, item.color, false, 'md')}
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-white truncate text-[11px]">${esc(item.name)}</div>
                    <div class="text-[10px] text-slate-400 truncate">${esc(item.sub)}</div>
                  </div>
                </div>
                ${item.legendUrl ? `
                <a href="${item.legendUrl}" target="_blank" rel="noopener noreferrer" class="shrink-0 p-1 text-slate-500 hover:text-[#00A0FF] transition" title="Abrir legenda WMS oficial do Ã³rgÃ£o">
                  <i data-lucide="external-link" class="w-3 h-3"></i>
                </a>` : ''}
              </div>`
              )
              .join('')}
          </div>
        </div>`;
    }

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  $('btn-toggle-legend')?.addEventListener('click', () => {
    const card = $('map-legend-card');
    const chevron = $('legend-chevron');
    if (!card) return;
    const isHidden = card.classList.contains('hidden');
    if (isHidden) {
      updateMapLegend();
      card.classList.remove('hidden');
      chevron?.classList.add('rotate-180');
    } else {
      card.classList.add('hidden');
      chevron?.classList.remove('rotate-180');
    }
  });

  $('btn-close-legend')?.addEventListener('click', () => {
    $('map-legend-card')?.classList.add('hidden');
    $('legend-chevron')?.classList.remove('rotate-180');
  });

  let allBuffersVisible = true;
  $('btn-toggle-all-buffers')?.addEventListener('click', () => {
    allBuffersVisible = !allBuffersVisible;
    projectLayers.forEach((l) => {
      if (l.simulated_buffer_m) l.show_buffer = allBuffersVisible;
    });
    renderLayersOnMap();
    renderProjectLayersUI();
    updateMapLegend();
    const btnText = $('toggle-buffers-btn-text');
    if (btnText) btnText.textContent = allBuffersVisible ? 'Ver Raio' : 'Oculto';
    showToast(allBuffersVisible ? 'Camadas do raio de análise exibidas no mapa.' : 'Camadas do raio de análise ocultadas.');
  });

  map.on('click', async (e) => {
    if (isMeasureMode) {
      addMeasurePoint(e.latlng);
      return;
    }
    if (isDrawingMode) {
      if (drawGeometryType === 'Point') {
        const ptGeom = { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] };
        isDrawingMode = false;
        drawingHelper.classList.add('hidden');
        map.getContainer().style.cursor = '';
        clearTempDraw();

        const name = window.prompt('Nome da camada de ponto:', `Vértice / Poço ${projectLayers.length + 1}`) || `Ponto ${projectLayers.length + 1}`;
        await addProjectLayer({
          name,
          geom_type: 'Point',
          geometry: ptGeom,
          metrics: { lat: e.latlng.lat, lon: e.latlng.lng },
        });
        return;
      }

      const pt = [e.latlng.lat, e.latlng.lng];
      drawPoints.push(pt);
      tempDrawMarkers.push(L.circleMarker(pt, { radius: 5, color: '#fff', fillColor: '#10B981', fillOpacity: 1 }).addTo(map));
      if (tempDrawPolyline) map.removeLayer(tempDrawPolyline);
      if (drawGeometryType === 'Polygon') {
        tempDrawPolyline = L.polygon(drawPoints, { color: '#008ee0', dashArray: '4,4', fillColor: '#10B981', fillOpacity: 0.15 }).addTo(map);
      } else {
        tempDrawPolyline = L.polyline(drawPoints, { color: '#06b6d4', dashArray: '4,4', weight: 3 }).addTo(map);
      }
      return;
    }
    if (isCommentMode) {
      isCommentMode = false;
      $('comment-btn-label').textContent = 'Adicionar Nota no Mapa';
      map.getContainer().style.cursor = '';
      const text = window.prompt('Escreva a observação técnica para este ponto:');
      if (!text) return;
      L.marker(e.latlng)
        .bindPopup(`<div class="p-1 space-y-1"><div class="text-[10px] font-bold uppercase text-[#00A0FF]">${isClientPortalMode ? 'Cliente' : 'Consultor'}</div>
          <div class="text-xs text-white">${esc(text)}</div>
          <div class="text-[10px] font-mono text-slate-400">${e.latlng.lat.toFixed(5)}°, ${e.latlng.lng.toFixed(5)}°</div></div>`)
        .addTo(layerGroups.user_comments)
        .openPopup();
      return;
    }
    identifyAt(e.latlng);
  });
  map.on('mousemove', (e) => {
    $('mouse-coords').textContent = `Lat: ${e.latlng.lat.toFixed(4)}° | Lon: ${e.latlng.lng.toFixed(4)}°`;
    if (isMeasureMode && measurePoints.length > 0) {
      handleMeasureMove(e.latlng);
    }
  });

  map.on('dblclick', (e) => {
    if (isMeasureMode) {
      L.DomEvent.stop(e);
      finishMeasurement();
      return;
    }
  });

  $('btn-zoom-property')?.addEventListener('click', () => {
    if (layerGroups.perimetro.getLayers().length) {
      const bounds = layerGroups.perimetro.getBounds();
      if (bounds.isValid()) {
        if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
          map.setView(bounds.getCenter(), 14);
        } else {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
      }
    }
  });

  $('btn-search-car')?.addEventListener('click', async () => {
    if (!currentProject || !sb || isSharedPortal) return showToast('Selecione um projeto para salvar o Recibo do CAR.');
    const car = $('car-input').value.trim();
    const { data, error } = await sb.from('projects').update({ car_code: car || null }).eq('id', currentProject.id).select().single();
    if (error) return showToast(error.message);
    currentProject = data;
    projects = projects.map((p) => (p.id === data.id ? data : p));
    renderHub();
    showToast('Recibo/Matrícula salvo no projeto. (A busca automática no SICAR ainda não está integrada.)');
  });

  // ---------------------------------------------------------------- Pacote de Camadas (Empreendimento, Buffer e Feicoes Recortadas)
  const modalDownloadLayers = $('modal-download-layers');

  function getLayersExportData() {
    if (!projectLayers.length && !currentRing) {
      showToast('Nenhuma camada ou perímetro ativo no projeto para exportação.');
      return null;
    }

    const projectName = currentProject?.name || 'Projeto_Panorama';
    let bufferRadiusSummary = 'Nenhum';
    let bufferCount = 0;
    let clippedCount = 0;

    // 1. Camadas do Empreendimento
    const projFeatures = [];
    if (projectLayers.length) {
      projectLayers.forEach((lyr, idx) => {
        if (!lyr.geometry) return;
        const feat = {
          type: 'Feature',
          properties: {
            tipo: 'Empreendimento',
            camada: lyr.name || `Camada_${idx + 1}`,
            geometria: lyr.geom_type || lyr.geometry.type,
            buffer_m: lyr.simulated_buffer_m || 0,
            ...(lyr.metrics || {})
          },
          geometry: lyr.geometry
        };
        projFeatures.push(feat);
      });
    } else if (currentRing) {
      const coords = currentRing.concat([currentRing[0]]).map((p) => [p[1], p[0]]);
      projFeatures.push({
        type: 'Feature',
        properties: {
          tipo: 'Empreendimento',
          camada: projectName,
          geometria: 'Polygon'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        }
      });
    }

    // 2. Raio de AnÃ¡lise (Buffer)
    const bufferFeatures = [];
    projectLayers.forEach((lyr) => {
      if (lyr.geometry && lyr.simulated_buffer_m && lyr.simulated_buffer_m > 0 && typeof turf !== 'undefined') {
        try {
          const feat = turf.feature(lyr.geometry);
          const buffered = turf.buffer(feat, lyr.simulated_buffer_m, { units: 'meters' });
          if (buffered) {
            buffered.properties = {
              tipo: 'Raio de AnÃ¡lise (Buffer)',
              camada: `Buffer ${lyr.simulated_buffer_m}m - ${lyr.name}`,
              raio_metros: lyr.simulated_buffer_m,
              origem: lyr.name
            };
            bufferFeatures.push(buffered);
            bufferCount++;
            bufferRadiusSummary = `${lyr.simulated_buffer_m} m`;
          }
        } catch (e) {
          console.warn('Erro ao calcular buffer da camada:', e);
        }
      }
    });

    // 3. FeiÃ§Ãµes Recortadas dentro do Buffer de AnÃ¡lise
    let clipMask = null;
    try {
      if (bufferFeatures.length === 1) {
        clipMask = bufferFeatures[0];
      } else if (bufferFeatures.length > 1) {
        clipMask = bufferFeatures.reduce((acc, curr) => turf.union(acc, curr));
      } else if (projFeatures.length && projFeatures[0].geometry.type.includes('Polygon')) {
        clipMask = projFeatures[0];
      }
    } catch (e) {
      console.warn('Erro ao criar mÃ¡scara de recorte:', e);
    }

    const clippedFeatures = [];
    const activeLyr = projectLayers[activeLayerIdx] || projectLayers[0];
    const cards = activeLyr?.analysis?.cards || currentCards || [];

    cards.forEach((card) => {
      // Feições com incidência direta + feições dentro do raio de análise
      const cardFeatures = [...(card.features || []), ...(card.nearFeatures || [])];
      if (!cardFeatures.length) return;
      const baseName = card.base || card.key || 'Base Oficial';

      cardFeatures.forEach((f, fIdx) => {
        const rawGeom = f.geom || f.geometry;
        if (!rawGeom) return;

        let finalGeom = f.clippedGeom || rawGeom;
        let wasClipped = !!f.clippedGeom;

        if (!wasClipped && clipMask && typeof turf !== 'undefined') {
          try {
            const fFeat = turf.feature(rawGeom);
            const gType = rawGeom.type;
            if (gType.includes('Polygon')) {
              const isect = turf.intersect(clipMask, fFeat);
              if (isect && isect.geometry) {
                finalGeom = isect.geometry;
                wasClipped = true;
              }
            } else if (gType.includes('Line')) {
              const split = turf.lineSplit(fFeat, clipMask);
              if (split && split.features.length) {
                const inside = split.features.filter((seg) => {
                  const mid = turf.along(seg, turf.length(seg) / 2);
                  return turf.booleanPointInPolygon(mid, clipMask);
                });
                if (inside.length) {
                  finalGeom = inside.length === 1 ? inside[0].geometry : {
                    type: 'MultiLineString',
                    coordinates: inside.map((s) => s.geometry.coordinates)
                  };
                  wasClipped = true;
                }
              }
            } else if (gType.includes('Point')) {
              if (turf.booleanPointInPolygon(turf.point(rawGeom.coordinates), clipMask)) {
                finalGeom = rawGeom;
                wasClipped = true;
              }
            }
          } catch (e) {
            console.warn('Erro ao recortar feicao geometrica:', e);
          }
        }

        const featureName = f.props?.nom_comple || f.props?.nome || f.props?.numero_do_ || f.props?.cod_tema || `${baseName} #${fIdx + 1}`;
        const clippedFeat = {
          type: 'Feature',
          properties: {
            tipo: 'Feição Recortada',
            base_oficial: baseName,
            status: card.status || 'Incidente',
            nome: featureName,
            recorte: wasClipped ? 'Recortada no Buffer' : 'Incidência Integral',
            ...(f.props || {})
          },
          geometry: finalGeom
        };
        clippedFeatures.push(clippedFeat);
        clippedCount++;
      });
    });

    return {
      projectName,
      projFeatures,
      bufferFeatures,
      clippedFeatures,
      bufferRadiusSummary,
      allFeatures: [...projFeatures, ...bufferFeatures, ...clippedFeatures]
    };
  }

  function geomToKml(geom) {
    if (!geom) return '';
    const type = geom.type;
    if (type === 'Polygon') {
      const ring = geom.coordinates[0];
      const coords = ring.map((pt) => `${pt[0]},${pt[1]},0`).join(' ');
      return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    }
    if (type === 'MultiPolygon') {
      return `<MultiGeometry>${geom.coordinates.map((poly) => {
        const ring = poly[0];
        const coords = ring.map((pt) => `${pt[0]},${pt[1]},0`).join(' ');
        return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }).join('')}</MultiGeometry>`;
    }
    if (type === 'LineString') {
      const coords = geom.coordinates.map((pt) => `${pt[0]},${pt[1]},0`).join(' ');
      return `<LineString><coordinates>${coords}</coordinates></LineString>`;
    }
    if (type === 'MultiLineString') {
      return `<MultiGeometry>${geom.coordinates.map((line) => {
        const coords = line.map((pt) => `${pt[0]},${pt[1]},0`).join(' ');
        return `<LineString><coordinates>${coords}</coordinates></LineString>`;
      }).join('')}</MultiGeometry>`;
    }
    if (type === 'Point') {
      return `<Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]},0</coordinates></Point>`;
    }
    return '';
  }

  function propsToHtmlTable(props) {
    const rows = Object.entries(props)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `<tr><td style="font-weight:bold;padding:3px 6px;border:1px solid #cbd5e1;background:#f8fafc;">${esc(k)}</td><td style="padding:3px 6px;border:1px solid #cbd5e1;">${esc(String(v))}</td></tr>`)
      .join('');
    return `<![CDATA[<table style="border-collapse:collapse;font-family:sans-serif;font-size:11px;width:100%;">${rows}</table>]]>`;
  }

  function exportKmlPackage(data) {
    const docName = esc(data.projectName || 'Projeto_Panorama');
    
    // Pasta 1: Empreendimento
    const projPlacemarks = data.projFeatures.map((f) => `
      <Placemark>
        <name>${esc(f.properties.camada || 'Empreendimento')}</name>
        <styleUrl>#style-proj</styleUrl>
        <description>${propsToHtmlTable(f.properties)}</description>
        ${geomToKml(f.geometry)}
      </Placemark>
    `).join('\n');

    // Pasta 2: Raio de AnÃ¡lise (Buffer)
    const bufferPlacemarks = data.bufferFeatures.map((f) => `
      <Placemark>
        <name>${esc(f.properties.camada || 'Raio de AnÃ¡lise')}</name>
        <styleUrl>#style-buffer</styleUrl>
        <description>${propsToHtmlTable(f.properties)}</description>
        ${geomToKml(f.geometry)}
      </Placemark>
    `).join('\n');

    // Pasta 3: Feições Recortadas
    const clippedPlacemarks = data.clippedFeatures.map((f) => `
      <Placemark>
        <name>${esc(f.properties.nome || f.properties.base_oficial || 'Restrição Recortada')}</name>
        <styleUrl>#style-clipped</styleUrl>
        <description>${propsToHtmlTable(f.properties)}</description>
        ${geomToKml(f.geometry)}
      </Placemark>
    `).join('\n');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Pacote_${docName}_SIRGAS2000</name>
    <description>PANORAMA GIS • Camadas do Empreendimento, Raio de Análise e Feições Recortadas</description>
    
    <Style id="style-proj">
      <LineStyle><color>ffffc000</color><width>2.5</width></LineStyle>
      <PolyStyle><color>40ffc000</color></PolyStyle>
      <IconStyle><color>ffffc000</color><scale>1.1</scale></IconStyle>
    </Style>
    <Style id="style-buffer">
      <LineStyle><color>ff4444ef</color><width>2.0</width></LineStyle>
      <PolyStyle><color>254444ef</color></PolyStyle>
    </Style>
    <Style id="style-clipped">
      <LineStyle><color>ff2222f4</color><width>2.2</width></LineStyle>
      <PolyStyle><color>552222f4</color></PolyStyle>
      <IconStyle><color>ff2222f4</color><scale>1.2</scale></IconStyle>
    </Style>

    <Folder>
      <name>1. Empreendimento (Perímetro / Eixo)</name>
      ${projPlacemarks}
    </Folder>

    <Folder>
      <name>2. Raio de Análise (Buffer Paramétrico)</name>
      ${bufferPlacemarks || '<Placemark><name>Sem buffer configurado</name></Placemark>'}
    </Folder>

    <Folder>
      <name>3. Feições Oficiais Recortadas na Área de Influência</name>
      ${clippedPlacemarks || '<Placemark><name>Nenhuma sobreposição oficial identificada</name></Placemark>'}
    </Folder>

    <Folder>
      <name>3. FeiÃ§Ãµes Oficiais Recortadas na Ãrea de InfluÃªncia</name>
      ${clippedPlacemarks || '<Placemark><name>Nenhuma sobreposiÃ§Ã£o oficial identificada</name></Placemark>'}
    </Folder>
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${docName.replace(/[^a-z0-9]+/gi, '_')}_Camadas_SIRGAS2000.kml`;
    a.click();
    showToast('Download do pacote KML iniciado.');
  }

  function exportGeoJsonPackage(data) {
    const docName = (data.projectName || 'projeto').replace(/[^a-z0-9]+/gi, '_');
    const fc = {
      type: 'FeatureCollection',
      name: `${docName}_SIRGAS2000`,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      features: data.allFeatures
    };

    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${docName}_Camadas_SIRGAS2000.geojson`;
    a.click();
    showToast('Download do arquivo GeoJSON iniciado.');
  }

  function exportShpPackage(data) {
    const docName = (data.projectName || 'projeto').replace(/[^a-z0-9]+/gi, '_');
    const fc = {
      type: 'FeatureCollection',
      features: data.allFeatures.map((f, i) => ({
        type: 'Feature',
        properties: {
          id: i + 1,
          tipo: (f.properties.tipo || '').substring(0, 15),
          camada: (f.properties.camada || f.properties.nome || '').substring(0, 30),
          base: (f.properties.base_oficial || '').substring(0, 20),
          status: (f.properties.status || '').substring(0, 15),
          recorte: (f.properties.recorte || '').substring(0, 20)
        },
        geometry: f.geometry
      }))
    };

    if (window.shpwrite && typeof window.shpwrite.download === 'function') {
      try {
        shpwrite.download(fc, {
          folder: `${docName}_SIRGAS2000_SHP`,
          types: {
            point: 'pontos_projeto',
            polygon: 'poligonos_e_buffers',
            line: 'linhas_e_eixos'
          }
        });
        showToast('Download do pacote Shapefile (.zip) iniciado.');
        return;
      } catch (err) {
        console.warn('Erro ao gerar Shapefile via shpwrite:', err);
      }
    }

    exportGeoJsonPackage(data);
  }

  $('btn-download-layers-package')?.addEventListener('click', () => {
    const data = getLayersExportData();
    if (!data) return;

    if ($('export-summary-proj')) {
      $('export-summary-proj').textContent = data.projectName;
    }
    if ($('export-summary-buffer')) {
      $('export-summary-buffer').textContent = data.bufferFeatures.length ? data.bufferRadiusSummary : 'Sem raio definido';
    }
    if ($('export-summary-clipped')) {
      $('export-summary-clipped').textContent = data.clippedFeatures.length ? `${data.clippedFeatures.length} feição(ões) incidente(s)` : 'Nenhuma sobreposição incidente';
    }

    modalDownloadLayers?.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  });

  $('btn-close-download-layers')?.addEventListener('click', () => {
    modalDownloadLayers?.classList.add('hidden');
  });

  modalDownloadLayers?.addEventListener('click', (e) => {
    if (e.target === modalDownloadLayers) {
      modalDownloadLayers.classList.add('hidden');
    }
  });

  $('btn-export-kml-action')?.addEventListener('click', () => {
    const data = getLayersExportData();
    if (data) {
      exportKmlPackage(data);
      modalDownloadLayers?.classList.add('hidden');
    }
  });

  $('btn-export-shp-action')?.addEventListener('click', () => {
    const data = getLayersExportData();
    if (data) {
      exportShpPackage(data);
      modalDownloadLayers?.classList.add('hidden');
    }
  });

  $('btn-export-geojson-action')?.addEventListener('click', () => {
    const data = getLayersExportData();
    if (data) {
      exportGeoJsonPackage(data);
      modalDownloadLayers?.classList.add('hidden');
    }
  });

  // ---------------------------------------------------------------- Laudo (relatório) & Marca
  function getBrand() {
    if (isSharedPortal && sharedBrand) return sharedBrand;

    let localBrand = null;
    try {
      const saved = localStorage.getItem('panorama_brand_config');
      if (saved) localBrand = JSON.parse(saved);
    } catch (e) {}

    // No plano iniciante, o cabeçalho do laudo usa o padrão do sistema. No profissional, logo e marca são customizados.
    const isCustomBrandAllowed = plan ? Boolean(plan.custom_brand) : true;

    const name = (isCustomBrandAllowed && localBrand?.name) ? localBrand.name : (isCustomBrandAllowed && consultancy?.brand_name) ? consultancy.brand_name : (consultancy?.name || 'Panorama GIS');
    const slogan = (isCustomBrandAllowed && localBrand?.name && localBrand.name !== 'Panorama GIS') ? (localBrand.slogan || '') : ((consultancy?.brand_slogan && !consultancy.brand_slogan.includes('Ampliando') && !consultancy.brand_slogan.includes('Plataforma')) ? consultancy.brand_slogan : 'An\u00e1lise Socioambiental Expedita - ASE');
    const logo = isCustomBrandAllowed ? ((localBrand && localBrand.logo !== undefined) ? localBrand.logo : (consultancy?.brand_logo || null)) : null;
    const rt_name = localBrand?.rt_name || consultancy?.rt_name || '';

    return { name, slogan, logo, rt_name };
  }

  // ---------------------------------------------------------------- Histórico de Laudos (Nuvem / Local)
  async function saveReportToHistory() {
    try {
      const b = getBrand();
      const activeLyr = projectLayers[activeLayerIndex] || projectLayers.find((l) => l.geom_type && l.geom_type.includes('Polygon'));
      const areaHa = activeLyr?.metrics?.area_ha || (currentRing ? metricsOf(currentRing).areaHa : null);
      
      const reportItem = {
        id: 'rep_' + Date.now(),
        title: currentProject?.name ? `Laudo ASE - ${currentProject.name}` : `Laudo ASE - Gleba ${new Date().toLocaleDateString('pt-BR')}`,
        client_name: currentProject?.client_name || 'Cliente Direto',
        municipality: currentProject?.municipality || '—',
        car_code: currentProject?.car_code || '—',
        area_ha: areaHa,
        cards_summary: (currentCards || []).map(c => ({ base: c.base, status: c.status, level: c.level, result: c.result })),
        created_at: new Date().toISOString(),
        project_id: currentProject?.id || null
      };

      let history = [];
      try {
        const raw = localStorage.getItem('panorama_reports_history');
        if (raw) history = JSON.parse(raw);
      } catch (e) {}

      const existingIdx = history.findIndex(h => h.project_id && h.project_id === reportItem.project_id && (Date.now() - new Date(h.created_at).getTime()) < 300000);
      if (existingIdx >= 0) {
        history[existingIdx] = { ...history[existingIdx], ...reportItem };
      } else {
        history.unshift(reportItem);
      }

      // Aplica retenção de histórico do plano (90 dias no Iniciante, permanente no Profissional)
      const isIni = plan?.id === 'iniciante' || plan?.id === 'essencial';
      if (isIni) {
        const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
        history = history.filter(h => new Date(h.created_at).getTime() >= cutoff);
      }
      localStorage.setItem('panorama_reports_history', JSON.stringify(history.slice(0, 100)));

      // Se conectado ao Supabase com tabela reports
      if (sb && consultancy?.id && currentProject?.id) {
        await sb.from('reports').insert({
          consultancy_id: consultancy.id,
          project_id: currentProject.id,
          title: reportItem.title,
          client_name: reportItem.client_name,
          municipality: reportItem.municipality,
          car_code: reportItem.car_code,
          area_ha: reportItem.area_ha,
          analysis: currentCards || [],
          created_at: reportItem.created_at
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Erro ao salvar laudo no histórico:', err);
    }
  }

  function populateReport() {
    const b = getBrand();
    $('report-consultancy-name').textContent = b.name;
    $('report-rt-info').textContent = b.rt_name ? `Resp. Técnico: ${b.rt_name}` : '';
    $('report-client-name').textContent = currentProject?.client_name || '—';
    $('report-prop-name').textContent = currentProject?.name || '—';
    $('report-prop-loc').textContent = currentProject?.municipality || '—';
    let areaText = '—';
    const activeLyr = projectLayers[activeLayerIndex] || projectLayers.find((l) => l.geom_type && l.geom_type.includes('Polygon'));
    if (activeLyr && activeLyr.metrics?.area_ha) {
      areaText = `${fmt(activeLyr.metrics.area_ha)} ha`;
    } else if (activeLyr && activeLyr.metrics?.length_m) {
      areaText = `${fmt(activeLyr.metrics.length_m / 1000, 2)} km (faixa ${activeLyr.simulated_buffer_m || 50}m)`;
    } else if (activeLyr && (activeLyr.geom_type?.includes('Point') || activeLyr.metrics?.lat)) {
      areaText = `Pontual (${activeLyr.simulated_buffer_m ? `raio ${activeLyr.simulated_buffer_m}m` : 'coordenada exata'})`;
    } else if (currentRing) {
      areaText = `${fmt(metricsOf(currentRing).areaHa)} ha`;
    }
    $('report-prop-area').textContent = areaText;
    $('report-conclusion-text').innerHTML = summarize(currentCards);
    const tbody = $('report-table-body');
    tbody.innerHTML = '';
    (currentCards || []).forEach((c) => {
      const col = { danger: 'text-rose-700 bg-rose-50 border-rose-200', warning: 'text-amber-700 bg-amber-50 border-amber-200', unknown: 'text-slate-700 bg-slate-100 border-slate-300' }[c.level] || 'text-[#008ee0] bg-sky-50 border-sky-200';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-2.5 px-3 font-semibold text-slate-800">${esc(c.base)}</td>
        <td class="py-2.5 px-3 text-slate-600">${esc(c.source)}</td>
        <td class="py-2.5 px-3 text-slate-700">${esc(c.result)}<div class="text-[10px] text-slate-500">${esc(c.detail)}</div></td>
        <td class="py-2.5 px-3 text-right"><span class="px-2 py-0.5 rounded font-bold text-[10px] border ${col}">${esc(c.status)}</span></td>`;
      tbody.appendChild(tr);
    });

    saveReportToHistory();
  }
  const modalReport = $('modal-report');
  ['btn-open-report', 'btn-open-report-2'].forEach((id) =>
    $(id)?.addEventListener('click', () => {
      populateReport();
      modalReport.classList.remove('hidden');
    })
  );
  $('btn-close-report')?.addEventListener('click', () => modalReport.classList.add('hidden'));

  // ---------------------------------------------------------------- Cabeçalho / marca
  function syncHeaderBranding() {
    const b = getBrand();
    const def = $('default-panorama-svg');
    const img = $('custom-uploaded-logo');
    const hasCustomLogo = Boolean(b.logo);
    const showBrand = isClientPortalMode || isSharedPortal;

    // Verificacao de teste de nova logo (URL param ou localStorage do Lab de Testes)
    let testLogo = localStorage.getItem("panorama_test_logo_override");
    try {
      const urlParams = new URLSearchParams(location.search);
      const paramTest = urlParams.get("test_logo");
      if (paramTest) {
        if (paramTest === "minimalista_hd" || paramTest === "globo_hd" || paramTest === "minimalista" || paramTest === "globo") {
          testLogo = paramTest.includes("completa") ? "assets/branding/teste/logo_minimalista_globo_hd_completa.png" : "assets/branding/teste/logo_minimalista_globo_hd_emblema.png";
        }
        else if (paramTest === "minimalista_3d" || paramTest === "globo_3d" || paramTest === "3d" || paramTest === "abaulada") {
          testLogo = paramTest.includes("completa") ? "assets/branding/teste/logo_minimalista_globo_3d_completa.png" : "assets/branding/teste/logo_minimalista_globo_3d_emblema.png";
        }
        else if (paramTest === "dark_esmeralda" || paramTest === "esmeralda") testLogo = "assets/branding/teste/logo_moderna_emblema_darkmode_esmeralda.png";
        else if (paramTest === "v1" || paramTest === "v1_emblema" || paramTest === "verde_roxo") testLogo = "assets/branding/teste/logo_moderna_v1_verde_roxo_emblema.png";
        else if (paramTest === "v1_completa") testLogo = "assets/branding/teste/logo_moderna_v1_verde_roxo_completa.png";
        else if (paramTest === "v2" || paramTest === "v2_emblema" || paramTest === "roxo_verde") testLogo = "assets/branding/teste/logo_moderna_v2_roxo_verde_emblema.png";
        else if (paramTest === "v2_completa") testLogo = "assets/branding/teste/logo_moderna_v2_roxo_verde_completa.png";
        else if (paramTest === "dark_ciano" || paramTest === "ciano") testLogo = "assets/branding/teste/logo_moderna_emblema_darkmode_ciano.png";
        else if (paramTest === "v3" || paramTest === "v3_emblema") testLogo = "assets/branding/teste/logo_moderna_v3_olho_neural_emblema.png";
        else if (paramTest === "v3_completa") testLogo = "assets/branding/teste/logo_moderna_v3_olho_neural_completa.png";
        else if (paramTest === "v4" || paramTest === "v4_emblema" || paramTest === "ultraminimalista") testLogo = "assets/branding/teste/logo_moderna_v4_olho_neural_emblema.png";
        else if (paramTest === "v4_completa") testLogo = "assets/branding/teste/logo_moderna_v4_olho_neural_completa.png";
        else if (paramTest === "emblema") testLogo = "assets/branding/teste/logo_moderna_emblema_transparente.png";
        else if (paramTest === "transparente") testLogo = "assets/branding/teste/logo_moderna_cropped_transparente.png";
        else if (paramTest === "branco") testLogo = "assets/branding/teste/logo_moderna_cropped_fundo_branco.jpeg";
        else if (paramTest === "original") testLogo = "assets/branding/teste/logo_moderna.jpeg";
        else if (paramTest.startsWith("v5") || paramTest.startsWith("gemini")) {
          const suf = paramTest.includes("completa") ? "completa" : "emblema";
          let clean = paramTest.replace("_completa", "").replace("_emblema", "");
          if (clean === "gemini" || clean === "v5" || clean === "v5_original") clean = "v5_gemini_original";
          else if (!clean.startsWith("v5_gemini_")) clean = "v5_gemini_" + clean.replace("v5_", "");
          testLogo = "assets/branding/teste/logo_" + clean + "_" + suf + ".png";
        }
        else if (paramTest === "reset" || paramTest === "off") {
          testLogo = null;
          localStorage.removeItem("panorama_test_logo_override");
        }
        if (testLogo) localStorage.setItem("panorama_test_logo_override", testLogo);
      }
      const paramFx = urlParams.get("test_effect");
      if (paramFx) {
        if (!testLogo) {
          testLogo = "assets/branding/teste/logo_moderna_emblema_transparente.png";
          localStorage.setItem("panorama_test_logo_override", testLogo);
        }
        localStorage.setItem("panorama_test_logo_effect", paramFx);
      }
    } catch (e) {}
      const activeSrc = testLogo || "assets/branding/atuais/Panorama_GIS_Emblema_Transparente.png";
    if (def) {
      if (def.getAttribute("src") !== activeSrc) def.src = activeSrc;
    }

    if (testLogo) {
      document.querySelectorAll('img[src*="Panorama_GIS_Emblema"], img[src*="logo_moderna"], img[src*="logo_minimalista"], img[src*="minimalista"]').forEach(el => {
        if (el !== img && el.id !== "custom-uploaded-logo") {
          el.src = testLogo;
        }
      });
    }

    // Remover resquicios de efeitos/filtros de teste do localStorage
    try {
      localStorage.removeItem("panorama_test_logo_effect");
      localStorage.removeItem("panorama_test_logo_override");
    } catch (e) {}

    const logoBox = $("brand-logo-box");
    const landingLogoA = document.querySelector('nav a img[src*="logo_moderna"], nav a img[src*="Panorama_GIS_Emblema"]') ? document.querySelector('nav a img[src*="logo_moderna"], nav a img[src*="Panorama_GIS_Emblema"]').parentElement : null;
    
    if (def) {
      def.classList.remove("fx-glow-ciano", "fx-glow-esmeralda", "fx-glow-roxo", "fx-glow-duplo", "fx-rim-light");
      def.style.filter = "none";
    }
    if (logoBox) logoBox.classList.remove("container-glass", "container-badge-branco", "container-spotlight");
    if (landingLogoA) {
      landingLogoA.classList.remove("container-glass", "container-badge-branco", "container-spotlight");
      const lImg = landingLogoA.querySelector("img");
      if (lImg) {
        lImg.classList.remove("fx-glow-ciano", "fx-glow-esmeralda", "fx-glow-roxo", "fx-glow-duplo", "fx-rim-light");
        lImg.style.filter = "none";
      }
    }

    if (hasCustomLogo && (showBrand || (b.name && b.name !== 'Panorama GIS'))) {
      if (def) def.classList.add('hidden');
      if (img) {
        img.src = b.logo;
        img.classList.remove('hidden');
      }
    } else {
      if (def) def.classList.remove('hidden');
      if (img) img.classList.add('hidden');
    }

    const title = $('brand-title');
    const badge = $('mode-badge');
    if (showBrand) {
      if (title) {
        const w = (b.name || 'Portal do Cliente').split(' ');
        title.innerHTML = `<span class="text-[#00A0FF]">${esc(w[0])}</span> ${esc(w.slice(1).join(' '))}`;
      }
      if ($('brand-subtitle')) $('brand-subtitle').textContent = `Portal do Cliente${currentProject ? ': ' + currentProject.client_name : ''}${b.rt_name ? ' • Resp.: ' + b.rt_name : ''}`;
      if (badge) {
        badge.textContent = 'Portal do Cliente';
        badge.className = 'text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#00A0FF]/20 text-[#00A0FF] border border-[#00A0FF]/40';
      }
    } else {
      if (title) {
        if (b.name && b.name !== 'Panorama GIS') {
          const w = b.name.split(' ');
          title.innerHTML = `<span class="text-[#00A0FF]">${esc(w[0])}</span> ${esc(w.slice(1).join(' '))}`;
        } else {
          title.innerHTML = 'PANORAMA <span class="text-[#00A0FF]">GIS</span>';
        }
      }
      const isMaster = profile?.role === 'master' || (profile?.role === 'admin' && !profile?.consultancy_id);
      const isCreator = profile?.role === 'creator' || (profile?.role === 'consultoria' && !profile?.is_owner);
      if ($('brand-subtitle')) $('brand-subtitle').textContent = isMaster ? 'Gestor do Panorama GIS' : ((b.name && b.name !== 'Panorama GIS') ? (b.slogan || b.name) : 'Análise Socioambiental Expedita - ASE');
      if (badge) {
        badge.textContent = isMaster ? 'Administrador Master' : (isCreator ? 'Analista GIS' : 'Modo Consultor');
        badge.className = 'text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#00A0FF]/15 text-[#00A0FF] border border-[#00A0FF]/30 shadow-sm';
      }
    }
    if ($('toggle-portal-text')) $('toggle-portal-text').textContent = isClientPortalMode ? 'Voltar ao Modo Consultor' : 'Simular Visão do Cliente';
  }

  function shareLink(p) {
    return `${location.origin}${location.pathname}?p=${p.share_slug}`;
  }

  function updateProjectPanel() {
    const p = currentProject;
    $('active-client-pill').textContent = p ? `Cliente: ${p.client_name}` : 'Projeto';
    $('banner-client-name').textContent = p ? p.client_name : 'Cliente';
    $('portal-url-preview').textContent = p?.share_slug ? shareLink(p).replace(/^https?:\/\//, '') : '—';
    $('prop-title').textContent = p ? p.name : 'Nenhum projeto selecionado';
    $('prop-location').textContent = p ? p.municipality || 'Município não informado' : 'Área da Consultoria → Cadastrar Novo Projeto';
    $('car-input').value = p?.car_code || '';
  }

  // ---------------------------------------------------------------- Projetos
  async function loadProjects() {
    const { data, error } = await sb.from('projects').select('*').eq('archived', false).order('created_at', { ascending: false });
    if (error) showToast('Erro ao carregar projetos: ' + error.message);
    projects = data || [];
  }

  function refreshProjectSelector() {
    const sel = $('scenario-select');
    sel.innerHTML = '';
    if (!projects.length) {
      const o = document.createElement('option');
      o.className = 'bg-[#0F172A] text-slate-100';
      o.textContent = 'Nenhum projeto — cadastre em "Área da Consultoria"';
      sel.appendChild(o);
    }
    projects.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.className = 'bg-[#0F172A] text-slate-100';
      const gType = p.geom_type || p.layers?.[0]?.geom_type || p.geometry?.type || 'Polygon';
      const typeBadge = gType.includes('Line') ? 'LINHA' : gType.includes('Point') ? 'PONTO' : 'POLÍGONO';
      o.textContent = `[${typeBadge}] ${p.name} — ${p.client_name}`;
      sel.appendChild(o);
    });
    if (currentProject && projects.some((p) => p.id === currentProject.id)) sel.value = currentProject.id;
    const used = projects.length;
    if ($('clients-count-pill')) {
      $('clients-count-pill').textContent = plan ? `${used}/${plan.max_projects >= UNLIMITED ? '∞' : plan.max_projects}` : `${used}`;
    }
  }

  async function selectProject(p) {
    currentProject = p;
    currentRing = null;
    currentCards = null;
    projectLayers = [];
    activeLayerIndex = 0;
    layerGroups.perimetro.clearLayers();
    updateProjectPanel();

    if (p) {
      if (sb && !isSharedPortal) {
        const { data: dbLayers } = await sb
          .from('project_layers')
          .select('*')
          .eq('project_id', p.id)
          .order('created_at', { ascending: true });
        projectLayers = dbLayers || [];
      } else if (p.layers) {
        projectLayers = JSON.parse(JSON.stringify(p.layers));
      }

      // Migração suave de projetos legados com p.geometry
      if (projectLayers.length === 0 && p.geometry) {
        const isPoly = p.geom_type === 'Polygon' || p.geometry.type === 'Polygon';
        const isLine = p.geom_type === 'LineString' || p.geometry.type === 'LineString';
        const initialLyr = {
          name: p.layer_name || (isLine ? 'Diretriz do Traçado (Linha)' : isPoly ? 'Perímetro do Imóvel (Polígono)' : 'Estrutura Central (Ponto)'),
          geom_type: p.geom_type || p.geometry.type || 'Polygon',
          geometry: p.geometry,
          color: p.color || (isLine ? '#06b6d4' : isPoly ? '#00A0FF' : '#ec4899'),
          visible: true,
          simulated_buffer_m: p.simulated_buffer_m !== undefined && p.simulated_buffer_m !== null ? p.simulated_buffer_m : 0,
          metrics: p.metrics || (isPoly ? { area_ha: p.area_ha || 0, perimeter_km: p.perimeter_km || 0 } : isLine ? { length_m: p.length_m || (p.length_km ? p.length_km * 1000 : 0) } : { lat: p.geometry.coordinates[1], lon: p.geometry.coordinates[0] }),
          analysis: p.analysis,
          analysis_at: p.analysis_at,
        };
        if (sb && !isSharedPortal) {
          const { data } = await sb.from('project_layers').insert({
            project_id: p.id,
            ...initialLyr,
          }).select().single();
          if (data) projectLayers.push(data);
          else projectLayers.push(initialLyr);
        } else {
          projectLayers.push(initialLyr);
        }
      }

      renderLayersOnMap();
      renderProjectLayersUI();
      displayActiveLayerAnalysis();
    } else {
      renderLayersOnMap();
      renderProjectLayersUI();
      displayActiveLayerAnalysis();
    }

    refreshProjectSelector();
    syncHeaderBranding();
  }

  $('scenario-select')?.addEventListener('change', (e) => {
    const p = projects.find((x) => x.id === e.target.value);
    if (p) selectProject(p);
  });

  $('btn-create-client-portal')?.addEventListener('click', async () => {
    const client = $('new-client-name').value.trim();
    const name = $('new-client-project').value.trim();
    const city = $('new-client-city').value.trim();
    if (!client || !name) return showToast('Informe o cliente e o nome do projeto.');

    let data = null;
    if (sb && profile && !String(profile.id).startsWith('demo-')) {
      const res = await sb
        .from('projects')
        .insert({ consultancy_id: profile.consultancy_id, created_by: profile.id, client_name: client, name, municipality: city || null })
        .select()
        .single();
      if (res.error) {
        const m = res.error.message || '';
        if (m.includes('PROJECT_QUOTA_EXCEEDED')) return showToast(`Limite de ${maxLabel(plan.max_projects)} projetos do ${plan.name} atingido. Fale com o gestor para ampliar o plano.`);
        if (m.includes('TRIAL_EXPIRED')) return showToast('Seu teste grátis terminou. Fale com o gestor do Panorama GIS.');
        if (m.includes('ACCOUNT_SUSPENDED')) return showToast('Conta suspensa. Fale com o gestor do Panorama GIS.');
        return showToast('Não foi possível cadastrar: ' + m);
      }
      data = res.data;
    } else {
      data = {
        id: 'demo-proj-' + Date.now(),
        client_name: client,
        name: name,
        municipality: city || null,
        created_at: new Date().toISOString(),
      };
    }

    ['new-client-name', 'new-client-project', 'new-client-city'].forEach((i) => ($(i).value = ''));
    projects.unshift(data);
    selectProject(data);
    renderHub();
    $('modal-clients-hub').classList.add('hidden');
    showToast(`Projeto "${name}" cadastrado. Agora importe o KML/Shapefile ou desenhe a área.`);
  });

  // ---------------------------------------------------------------- Área da Consultoria (hub)
  async function renderHub() {
    if (!consultancy) return;
    populateHubBrandFields();
    const used = projects.length;
    const unlimited = plan.max_projects >= UNLIMITED;
    $('hub-consultancy-title').textContent = `Área da Consultoria: ${consultancy.name}`;
    $('hub-plan-badge').textContent = `${plan.name} • ${maxLabel(plan.max_projects)} projetos • ${plan.max_seats} acesso(s) simultâneo(s)`;
    $('hub-rt-display').textContent = consultancy.rt_name || '—';
    $('hub-quota-text').textContent = unlimited
      ? `${used} projetos ativos (ilimitados)`
      : `${used} de ${plan.max_projects} projetos utilizados (${Math.max(0, plan.max_projects - used)} disponíveis)`;
    $('hub-quota-bar').style.width = unlimited ? '100%' : `${Math.min(100, (used / plan.max_projects) * 100)}%`;

    document.querySelectorAll('.plan-card').forEach((card) => {
      const cur = card.getAttribute('data-plan') === plan.id;
      card.className = cur
        ? 'plan-card rounded-xl p-3.5 border-2 border-[#00A0FF] bg-[#00A0FF]/15 transition flex flex-col justify-between'
        : 'plan-card rounded-xl p-3.5 border border-slate-700 bg-slate-950/60 opacity-70 transition flex flex-col justify-between';
      const lbl = card.querySelector('.plan-select-label');
      if (lbl) lbl.textContent = cur ? 'Plano atual ✓' : '';
    });

    $('existing-clients-datalist').innerHTML = [...new Set(projects.map((p) => p.client_name))].map((c) => `<option value="${esc(c)}"></option>`).join('');

    const tbody = $('clients-hub-tbody');
    tbody.innerHTML = '';
    if (!projects.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-6 px-4 text-center text-slate-500">Nenhum projeto cadastrado ainda. Use o formulário acima.</td></tr>';
    }
    projects.forEach((p) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/50 transition';
      tr.innerHTML = `
        <td class="py-3 px-4"><div class="font-bold text-white">${esc(p.client_name)}</div><div class="text-[11px] text-slate-400">${esc(p.municipality || '')}</div></td>
        <td class="py-3 px-4"><div class="font-semibold text-[#00A0FF]">${esc(p.name)}</div>
          <div class="text-[10px] text-slate-400">${p.area_ha ? fmt(Number(p.area_ha)) + ' ha' : (p.length_km ? fmt(Number(p.length_km), 2) + ' km' : p.geom_type === 'Point' ? 'Pontual' : 'sem área')}${p.analysis_at ? ' • analisado ' + new Date(p.analysis_at).toLocaleDateString('pt-BR') : ''}</div></td>
        <td class="py-3 px-4"><span class="font-mono text-[11px] bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-[#00A0FF] break-all">${esc(shareLink(p))}</span></td>
        <td class="py-3 px-4 font-mono text-slate-300"><span class="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]">🔒 ${esc(p.share_pin)}</span></td>
        <td class="py-3 px-4 text-right space-x-1">
          <button data-act="open" data-id="${p.id}" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[#00A0FF] border border-[#00A0FF]/30 font-bold text-[11px] transition">Abrir no Mapa</button>
          <button data-act="copy" data-id="${p.id}" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[11px] transition">Copiar Link</button>
          <button data-act="del" data-id="${p.id}" class="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold text-[11px] transition">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-act]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = projects.find((x) => x.id === b.dataset.id);
        if (!p) return;
        if (b.dataset.act === 'open') {
          selectProject(p);
          $('modal-clients-hub').classList.add('hidden');
        } else if (b.dataset.act === 'copy') {
          copyText(`${shareLink(p)}  (PIN: ${p.share_pin})`);
        } else if (b.dataset.act === 'del') {
          if (!window.confirm(`Excluir o projeto "${p.name}"? Esta ação não pode ser desfeita.`)) return;
          if (sb && !String(p.id).startsWith('demo-')) {
            const { error } = await sb.from('projects').delete().eq('id', p.id);
            if (error) return showToast(error.message);
          }
          projects = projects.filter((x) => x.id !== p.id);
          if (currentProject?.id === p.id) selectProject(projects[0] || null);
          refreshProjectSelector();
          renderHub();
        }
      })
    );
    refreshProjectSelector();
    renderTeam();
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      showToast('Link copiado: ' + t);
    } catch (e) {
      window.prompt('Copie o link:', t);
    }
  }
  $('btn-copy-portal-link')?.addEventListener('click', () => currentProject && copyText(shareLink(currentProject)));

  async function renderTeam() {
    const box = $('team-box');
    if (!box || !consultancy) return;
    const isSolo = plan?.id === 'iniciante' || plan?.id === 'essencial' || (plan?.max_seats <= 1);
    const isCompanyAdmin = profile?.is_owner || (profile?.role === 'admin' && !!profile?.consultancy_id);

    const [{ data: members }, { data: seats }] = await Promise.all([
      sb.from('profiles').select('*').eq('consultancy_id', consultancy.id).order('created_at'),
      sb.rpc('my_seat_usage'),
    ]);
    $('team-seats-text').textContent = seats ? `Acessos simultâneos agora: ${seats.used} de ${seats.max}` : '—';
    const list = $('team-list');
    list.innerHTML = '';

    if (isSolo) {
      const m = (members && members[0]) || profile;
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#1E293B] border border-white/[0.08]';
      row.innerHTML = `<div><span class="font-semibold text-slate-100">${esc(m.full_name || m.email)}</span>
        <span class="text-slate-400 text-xs"> (${esc(m.email || '')})</span>
        <span class="ml-1.5 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Consultor Individual (Titular)</span></div>`;
      list.appendChild(row);

      const upgradeCard = document.createElement('div');
      upgradeCard.className = 'p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-center space-y-2 mt-3';
      upgradeCard.innerHTML = `
        <div class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
        </div>
        <h4 class="text-xs font-bold text-white">Equipe Multiusuário (Plano Profissional)</h4>
        <p class="text-[11px] text-slate-300 max-w-sm mx-auto leading-relaxed">
          Seu Plano Iniciante é exclusivo para 1 consultor individual. Para liberar até <strong>2 criadores simultâneos</strong> e sua logomarca no laudo, faça upgrade para o Plano Profissional.
        </p>
        <button type="button" onclick="showToast('Entre em contato com o suporte para realizar o upgrade da sua assinatura.')" class="mt-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg transition cursor-pointer">
          Solicitar Upgrade de Plano
        </button>
      `;
      list.appendChild(upgradeCard);
      $('team-add-form')?.classList.add('hidden');
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    (members || []).forEach((m) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 p-2 rounded-lg bg-[#1E293B] border border-white/[0.08]';
      const canToggle = isCompanyAdmin && m.id !== profile.id;
      const isOwnerOrAdmin = m.is_owner || m.role === 'admin';
      const roleBadge = isOwnerOrAdmin
        ? '<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-[#00A0FF]/20 text-[#00A0FF] font-bold">Admin (Gestor)</span>'
        : '<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">Creator (Analista)</span>';

      row.innerHTML = `<div><span class="font-semibold text-slate-100">${esc(m.full_name || m.email)}</span>
        <span class="text-slate-500"> ${esc(m.email || '')}</span>
        ${roleBadge}
        ${m.active ? '' : '<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">Desativado</span>'}</div>
        ${canToggle ? `<button data-uid="${m.id}" data-active="${m.active}" class="text-[11px] px-2 py-1 rounded border cursor-pointer ${m.active ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10' : 'border-[#00A0FF]/30 text-[#00A0FF] hover:bg-[#00A0FF]/10'}">${m.active ? 'Desativar' : 'Reativar'}</button>` : ''}`;
      list.appendChild(row);
    });
    list.querySelectorAll('button[data-uid]').forEach((b) =>
      b.addEventListener('click', async () => {
        const { error } = await invokeUsers({ action: 'set_member_active', user_id: b.dataset.uid, active: b.dataset.active !== 'true' });
        if (error) return showToast(error);
        renderTeam();
      })
    );
    $('team-add-form')?.classList.toggle('hidden', !isCompanyAdmin);
    if (window.lucide) window.lucide.createIcons();
  }

  async function invokeUsers(payload) {
    const { data, error } = await sb.functions.invoke('manage-users', { body: payload });
    if (error) {
      let msg = error.message;
      try {
        const j = await error.context.json();
        if (j?.error) msg = j.error;
      } catch (e) {}
      return { error: msg };
    }
    if (data?.error) return { error: data.error };
    return { data };
  }

  $('btn-team-add')?.addEventListener('click', async () => {
    const email = $('team-new-email').value.trim();
    const full_name = $('team-new-name').value.trim();
    if (!email) return showToast('Informe o e-mail do colaborador.');
    const { error } = await invokeUsers({ action: 'add_member', email, full_name });
    if (error) return showToast(error);
    $('team-new-email').value = '';
    $('team-new-name').value = '';
    showToast(`Convite enviado para ${email}. Ele define a senha pelo e-mail.`);
    renderTeam();
  });

  // ---------------------------------------------------------------- Marca da Consultoria (Área da Consultoria & Dropdown)
  function populateHubBrandFields() {
    const b = getBrand();
    if ($('hub-company-name')) $('hub-company-name').value = b.name || '';
    if ($('hub-company-slogan')) $('hub-company-slogan').value = b.slogan || '';
    if ($('hub-rt-name')) $('hub-rt-name').value = b.rt_name || '';
    if ($('wl-company-name')) $('wl-company-name').value = b.name || '';
    if ($('wl-company-slogan')) $('wl-company-slogan').value = b.slogan || '';
    if ($('wl-rt-name')) $('wl-rt-name').value = b.rt_name || '';

    pendingLogo = b.logo || null;
    updateHubLogoPreview(pendingLogo);
  }

  function updateHubLogoPreview(logoUrl) {
    const img = $('hub-logo-preview');
    const empty = $('hub-logo-empty');
    if (img && empty) {
      if (logoUrl) {
        img.src = logoUrl;
        img.classList.remove('hidden');
        empty.classList.add('hidden');
      } else {
        img.src = '';
        img.classList.add('hidden');
        empty.classList.remove('hidden');
      }
    }
  }

  async function saveConsultancyBrand(name, slogan, rt, logo) {
    const isCompanyAdmin = !profile || profile.is_owner || (profile.role === 'admin' && !!profile.consultancy_id) || profile.role === 'master';
    if (profile && !isCompanyAdmin) {
      showToast('Apenas o gestor da consultoria pode alterar os dados e o logotipo oficial.');
      return false;
    }
    if (!name) {
      showToast('Por favor, informe a razão social ou nome da consultoria.');
      return false;
    }

    // 1. Atualizar em memória imediatamente
    if (!consultancy) consultancy = {};
    consultancy.name = name;
    consultancy.brand_name = name;
    consultancy.brand_slogan = slogan;
    consultancy.rt_name = rt;
    consultancy.brand_logo = logo;

    // 2. Persistir localmente no navegador (garante funcionamento offline / teste local)
    try {
      localStorage.setItem('panorama_brand_config', JSON.stringify({
        name,
        slogan,
        rt_name: rt,
        logo,
        saved_at: new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Erro ao salvar localmente a marca:', e);
    }

    // 3. Persistir no Supabase se conectado e autenticado
    if (sb && typeof sb.rpc === 'function') {
      try {
        const { data: s } = await sb.auth.getSession();
        if (s?.session) {
          const { error } = await sb.rpc('update_brand', {
            p_name: name,
            p_slogan: slogan,
            p_rt: rt,
            p_logo: logo,
          });
          if (error) console.warn('Aviso Supabase update_brand:', error.message);
        }
      } catch (err) {
        console.warn('Sincronização cloud opcional:', err);
      }
    }

    // 4. Propagar por toda a interface
    syncHeaderBranding();
    syncUserProfileUI();
    populateReport();
    renderHub();
    populateHubBrandFields();
    showToast('✓ Marca da consultoria salva com sucesso!');
    return true;
  }

  // Upload e remoção de logo dentro da Área da Consultoria
  $('hub-logo-upload')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 350 * 1024) return showToast('Logomarca muito grande (máx. 350 KB). Envie uma imagem mais leve.');
    const r = new FileReader();
    r.onload = (ev) => {
      pendingLogo = ev.target.result;
      updateHubLogoPreview(pendingLogo);
      showToast('Logomarca carregada. Clique em "Salvar Marca da Consultoria" para confirmar.');
    };
    r.readAsDataURL(f);
  });

  $('btn-hub-reset-logo')?.addEventListener('click', () => {
    pendingLogo = null;
    updateHubLogoPreview(null);
    showToast('Logomarca removida. Clique em "Salvar Marca da Consultoria" para confirmar.');
  });

  $('btn-hub-save-brand')?.addEventListener('click', async () => {
    const name = $('hub-company-name').value.trim();
    const slogan = $('hub-company-slogan').value.trim();
    const rt = $('hub-rt-name').value.trim();
    await saveConsultancyBrand(name, slogan, rt, pendingLogo);
  });

  // Restaurar Marca para o PadrÃ£o Oficial PANORAMA GIS
  async function resetBrandToDefault() {
    const defaultName = 'Panorama GIS';
    const defaultSlogan = "Ampliando a Vis\\u00e3o do seu Neg\\u00f3cio";
    const defaultRt = '';
    
    pendingLogo = null;
    updateHubLogoPreview(null);
    
    if ($('hub-company-name')) $('hub-company-name').value = defaultName;
    if ($('hub-company-slogan')) $('hub-company-slogan').value = defaultSlogan;
    if ($('hub-rt-name')) $('hub-rt-name').value = defaultRt;
    
    if ($('wl-company-name')) $('wl-company-name').value = defaultName;
    if ($('wl-company-slogan')) $('wl-company-slogan').value = defaultSlogan;
    if ($('wl-rt-name')) $('wl-rt-name').value = defaultRt;
    
    try {
      localStorage.removeItem('panorama_brand_config');
    } catch (e) {}
    
    if (consultancy) {
      consultancy.name = defaultName;
      consultancy.brand_name = defaultName;
      consultancy.brand_slogan = defaultSlogan;
      consultancy.rt_name = defaultRt;
      consultancy.brand_logo = null;
    }
    
    if (sb && typeof sb.rpc === 'function') {
      try {
        const { data: s } = await sb.auth.getSession();
        if (s?.session) {
          await sb.rpc('update_brand', {
            p_name: defaultName,
            p_slogan: defaultSlogan,
            p_rt: defaultRt,
            p_logo: null,
          });
        }
      } catch (err) {
        console.warn('Erro ao restaurar marca no Supabase:', err);
      }
    }
    
    syncHeaderBranding();
    syncUserProfileUI();
    populateReport();
    renderHub();
    populateHubBrandFields();
    if (window.lucide) window.lucide.createIcons();
    showToast('\u2713 Marca restaurada para o padr\u00e3o oficial PANORAMA GIS!');
  }
  
  $('btn-hub-reset-to-default-brand')?.addEventListener('click', resetBrandToDefault);
  $('btn-wl-reset-to-default')?.addEventListener('click', resetBrandToDefault);

  // Alternância de Abas na Área da Consultoria
  function setHubTab(tabName) {
    document.querySelectorAll('.hub-tab-btn').forEach((btn) => {
      const isActive = btn.dataset.hubTab === tabName;
      btn.classList.toggle('bg-[#00A0FF]/20', isActive);
      btn.classList.toggle('text-[#00A0FF]', isActive);
      btn.classList.toggle('border-[#00A0FF]/40', isActive);
      btn.classList.toggle('text-slate-400', !isActive);
      btn.classList.toggle('border-transparent', !isActive);
    });
    ['projects', 'branding', 'team', 'quota'].forEach((t) => {
      const pane = $(`hub-tab-pane-${t}`);
      if (pane) pane.classList.toggle('hidden', t !== tabName);
    });
  }
  document.querySelectorAll('.hub-tab-btn').forEach((b) => {
    b.addEventListener('click', () => setHubTab(b.dataset.hubTab));
  });

  // Abertura e fechamento da Área da Consultoria
  $('btn-open-clients-hub')?.addEventListener('click', () => {
    renderHub();
    populateHubBrandFields();
    setHubTab('projects');
    $('modal-clients-hub')?.classList.remove('hidden');
  });
  $('btn-close-clients-hub')?.addEventListener('click', () => $('modal-clients-hub')?.classList.add('hidden'));

  // Fechamento universal de modais via clique no fundo (backdrop)
  const allModals = ['modal-clients-hub', 'modal-report', 'modal-download-layers', 'modal-auth-login', 'modal-auth-trial', 'modal-provider-admin', 'modal-whitelabel'];
  allModals.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target === el) el.classList.add('hidden');
    });
  });

  function cancelDrawing() {
    isDrawingMode = false;
    const dh = $('drawing-helper');
    if (dh) dh.classList.add('hidden');
    map.getContainer().style.cursor = '';
    clearTempDraw();
  }

  // Tecla Escape fecha modais, cancela desenho e fecha dropdowns
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      allModals.forEach((id) => $(id)?.classList.add('hidden'));
      if (userDropdown && !userDropdown.classList.contains('hidden')) {
        userDropdown.classList.add('hidden');
        if (userChevron) userChevron.style.transform = 'rotate(0deg)';
      }
      if (isDrawingMode) {
        cancelDrawing();
      }
    }
  });

  // Compatibilidade com modal avulso de White-Label (se chamado externamente)
  const modalWL = $('modal-whitelabel');
  $('btn-whitelabel-config')?.addEventListener('click', () => {
    populateHubBrandFields();
    modalWL?.classList.remove('hidden');
  });
  $('btn-close-whitelabel')?.addEventListener('click', () => modalWL?.classList.add('hidden'));
  $('wl-logo-upload')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 350 * 1024) return showToast('Logomarca muito grande (máx. 350 KB).');
    const r = new FileReader();
    r.onload = (ev) => {
      pendingLogo = ev.target.result;
      showToast('Logomarca carregada. Clique em Salvar para confirmar.');
    };
    r.readAsDataURL(f);
  });
  $('btn-reset-logo')?.addEventListener('click', () => {
    pendingLogo = null;
    showToast('Logomarca removida. Clique em Salvar para confirmar.');
  });
  $('btn-save-whitelabel')?.addEventListener('click', async () => {
    const name = $('wl-company-name').value.trim();
    const slogan = $('wl-company-slogan').value.trim();
    const rt = $('wl-rt-name').value.trim();
    const ok = await saveConsultancyBrand(name, slogan, rt, pendingLogo);
    if (ok) modalWL?.classList.add('hidden');
  });

  // ---------------------------------------------------------------- Menu do Usuário (Canto Direito)
  function getUserInitials(name) {
    if (!name) return 'RV';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function syncUserProfileUI() {
    const isMaster = profile?.role === 'master' || (profile?.role === 'admin' && !profile?.consultancy_id);
    const isCompanyAdmin = (profile?.role === 'admin' && !!profile?.consultancy_id) || (profile?.role === 'consultoria' && profile?.is_owner);
    const isCreator = profile?.role === 'creator' || (profile?.role === 'consultoria' && !profile?.is_owner);

    let displayRole = 'Consultor Técnico';
    if (isMaster) {
      displayRole = 'Administrador Master';
    } else if (isCompanyAdmin) {
      displayRole = (plan?.id === 'iniciante' || plan?.id === 'essencial') ? 'Consultor Individual (Admin Solo)' : 'Gestor da Empresa (Admin)';
    } else if (isCreator) {
      displayRole = 'Analista GIS (Creator)';
    }

    const name = profile?.full_name || consultancy?.rt_name || (isMaster ? 'Rodrigo Vasconcelos' : 'Consultor Técnico');
    const email = profile?.email || (isMaster ? 'admin@panoramagis.com.br' : 'consultor@exemplo.com.br');

    const initials = getUserInitials(name);
    if ($('user-avatar-circle')) $('user-avatar-circle').textContent = initials;
    if ($('user-display-name')) $('user-display-name').textContent = name;
    if ($('user-display-role')) $('user-display-role').textContent = displayRole;
    if ($('dropdown-user-name')) $('dropdown-user-name').textContent = name;
    if ($('dropdown-user-email')) $('dropdown-user-email').textContent = email;
    if ($('dropdown-plan-badge')) $('dropdown-plan-badge').textContent = isMaster ? 'Plataforma Master' : (plan?.name || 'Plano Profissional');

    const adminItem = $('menu-item-provider-admin');
    if (adminItem) adminItem.classList.toggle('hidden', !isMaster);
    const clientsHubItem = $('menu-item-clients-hub');
    if (clientsHubItem) clientsHubItem.classList.toggle('hidden', isMaster);
    if (window.lucide) window.lucide.createIcons();
    updateMapLegend();
  }

  const userDropdown = $('user-dropdown-menu');
  const userChevron = $('user-menu-chevron');

  $('btn-user-profile-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!userDropdown) return;
    const isHidden = userDropdown.classList.toggle('hidden');
    if (userChevron) userChevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  document.addEventListener('click', (e) => {
    if (userDropdown && !userDropdown.classList.contains('hidden') && !$('user-menu-container')?.contains(e.target)) {
      userDropdown.classList.add('hidden');
      if (userChevron) userChevron.style.transform = 'rotate(0deg)';
    }
  });

  $('menu-item-clients-hub')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    if (userChevron) userChevron.style.transform = 'rotate(0deg)';
    renderHub();
    populateHubBrandFields();
    setHubTab('projects');
    $('modal-clients-hub')?.classList.remove('hidden');
  });

  $('menu-item-provider-admin')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    if (userChevron) userChevron.style.transform = 'rotate(0deg)';
    renderAdmin();
    $('modal-provider-admin')?.classList.remove('hidden');
  });

  $('menu-item-landing')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    if (userChevron) userChevron.style.transform = 'rotate(0deg)';
    $('landing-page-view')?.classList.remove('hidden');
  });

  $('btn-logout')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    if (userChevron) userChevron.style.transform = 'rotate(0deg)';
    logout();
  });

  // ---------------------------------------------------------------- Simular visão do cliente
  $('btn-toggle-portal')?.addEventListener('click', () => {
    isClientPortalMode = !isClientPortalMode;
    applyPortalUI();
    showToast(isClientPortalMode ? 'Visão do cliente final ativada.' : 'De volta ao modo consultor.');
  });
  function applyPortalUI() {
    const client = isClientPortalMode || isSharedPortal;
    const isMaster = profile?.role === 'master' || (profile?.role === 'admin' && !profile?.consultancy_id);
    $('client-portal-banner')?.classList.toggle('hidden', !client);
    $('consultant-tools-card')?.classList.toggle('hidden', client);
    ['btn-whitelabel-config', 'btn-open-clients-hub'].forEach((id) => $(id)?.classList.toggle('hidden', client || isMaster));
    syncHeaderBranding();
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ---------------------------------------------------------------- Painel do Administrador (gestor do Panorama)
  const modalAdmin = $('modal-provider-admin');
  let adminRows = [];

  const statusBadge = (c) => {
    if (c.status === 'active') return '<span class="px-2 py-0.5 rounded-full bg-[#00A0FF]/20 text-[#00A0FF] border border-[#00A0FF]/30 font-bold text-[10px]">● Ativa</span>';
    if (c.status === 'trial') {
      const d = c.trial_ends_at ? Math.ceil((new Date(c.trial_ends_at) - Date.now()) / 86400000) : 0;
      return `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">⏳ Teste (${d > 0 ? d + ' d' : 'vencido'})</span>`;
    }
    return '<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px]">● Suspensa</span>';
  };

  async function renderAdmin() {
    if (!sb) {
      adminRows = [
        {
          id: 'cons-1',
          name: 'Cerrado Geo Consultoria Ambiental',
          cnpj: '14.892.341/0001-88',
          contact_email: 'diretoria@cerradogeo.com.br',
          rt_name: 'Eng. Fernando Lima',
          users_count: 4,
          plan_id: 'profissional',
          price_monthly: 590,
          due_day: 10,
          status: 'active',
          projects_count: 16,
          max_projects: 20,
          seats_in_use: 2,
          max_seats: 3
        },
        {
          id: 'cons-2',
          name: 'BioFlora Mapeamento & SoluÃ§Ãµes Rurais',
          cnpj: '28.109.552/0001-40',
          contact_email: 'contato@bioflora.eng.br',
          rt_name: 'BiÃ³loga Camila Torres',
          users_count: 7,
          plan_id: 'corporativo',
          price_monthly: 990,
          due_day: 15,
          status: 'active',
          projects_count: 48,
          max_projects: 999999,
          seats_in_use: 3,
          max_seats: 10
        },
        {
          id: 'cons-3',
          name: 'Agrotop Engenharia e Agrimensura',
          cnpj: '35.441.982/0001-12',
          contact_email: 'atendimento@agrotop.com.br',
          rt_name: 'Eng. Agrimensor Marcelo Rezende',
          users_count: 1,
          plan_id: 'essencial',
          price_monthly: 290,
          due_day: 5,
          status: 'trial',
          projects_count: 4,
          max_projects: 5,
          seats_in_use: 1,
          max_seats: 1
        }
      ];
    } else {
      const { data, error } = await sb.rpc('admin_overview');
      if (error) return showToast('Erro no painel: ' + error.message);
      adminRows = data || [];
    }
    const tbody = $('provider-admin-tbody');
    tbody.innerHTML = '';
    let mrr = 0, projTotal = 0, seatsNow = 0;
    const cnt = { active: 0, trial: 0, suspended: 0 };
    if (!adminRows.length) tbody.innerHTML = '<tr><td colspan="7" class="py-6 px-4 text-center text-slate-500">Nenhuma consultoria cadastrada. Use o formulário acima para liberar o primeiro acesso.</td></tr>';

    adminRows.forEach((c) => {
      cnt[c.status]++;
      if (c.status === 'active') mrr += Number(c.price_monthly);
      projTotal += Number(c.projects_count);
      seatsNow += Number(c.seats_in_use);
      const unl = c.max_projects >= UNLIMITED;
      const pct = unl ? 10 : Math.min(100, Math.round((c.projects_count / c.max_projects) * 100));
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/50 transition';
      tr.innerHTML = `
        <td class="py-3.5 px-4"><div class="font-bold text-white">${esc(c.name)}</div><div class="text-[11px] font-mono text-slate-400">CNPJ: ${esc(c.cnpj || '—')}</div></td>
        <td class="py-3.5 px-4"><div class="text-slate-200 font-medium">${esc(c.contact_email || '—')}</div><div class="text-[10px] text-slate-400">${esc(c.rt_name || '')} • ${c.users_count} usuário(s)</div></td>
        <td class="py-3.5 px-4"><select data-plan-of="${c.id}" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-[#00A0FF] focus:outline-none">
          ${Object.values(plans).map((p) => `<option value="${p.id}" ${p.id === c.plan_id ? 'selected' : ''}>${esc(p.name.replace('Plano ', ''))} (${maxLabel(p.max_projects)} proj. • ${p.max_seats} ac.)</option>`).join('')}</select></td>
        <td class="py-3.5 px-4">
          <div class="flex items-center justify-between text-[11px] mb-1"><span class="font-mono font-bold text-white">${c.projects_count} / ${unl ? '∞' : c.max_projects} proj.</span></div>
          <div class="w-36 h-2 bg-slate-800 rounded-full overflow-hidden"><div class="bg-[#00A0FF] h-full rounded-full" style="width:${pct}%"></div></div>
          <div class="text-[10px] text-slate-400 mt-1">Acessos agora: <strong>${c.seats_in_use}</strong> / ${c.max_seats}</div>
          <div class="text-[10px] text-slate-500">🔒 Nomes e mapas dos clientes ocultos (LGPD)</div></td>
        <td class="py-3.5 px-4"><div class="font-mono font-bold text-slate-200">R$ ${fmt(Number(c.price_monthly), 2)} /mês</div><div class="text-[10px] text-slate-400">Venc. dia ${c.due_day || 10}</div></td>
        <td class="py-3.5 px-4">${statusBadge(c)}</td>
        <td class="py-3.5 px-4 text-right space-x-1">
          ${c.status !== 'active' ? `<button data-set="${c.id}" data-st="active" class="px-3 py-1.5 rounded-lg bg-[#00A0FF] hover:bg-[#008ee0] shadow-lg shadow-[#00A0FF]/30 text-white font-bold text-[11px]">${c.status === 'trial' ? 'Ativar assinatura' : 'Reativar'}</button>` : ''}
          ${c.status !== 'suspended' ? `<button data-set="${c.id}" data-st="suspended" class="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-[11px]">Suspender</button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });

    $('admin-kpi-mrr').textContent = `R$ ${fmt(mrr, 2)} / mês`;
    $('admin-kpi-arr').textContent = `Projeção anual: R$ ${fmt(mrr * 12, 2)}`;
    $('admin-kpi-tenants').textContent = `${adminRows.length} Empresa(s)`;
    $('admin-kpi-tenants-detail').textContent = `${cnt.active} ativas • ${cnt.trial} em teste • ${cnt.suspended} suspensas`;
    $('admin-kpi-projects').textContent = `${projTotal} Projetos`;
    $('admin-kpi-seats').textContent = `Acessos simultâneos em uso agora: ${seatsNow}`;

    tbody.querySelectorAll('select[data-plan-of]').forEach((s) =>
      s.addEventListener('change', async () => {
        const { error: e } = await sb.from('consultancies').update({ plan_id: s.value }).eq('id', s.dataset.planOf);
        if (e) return showToast(e.message);
        showToast('Plano atualizado.');
        renderAdmin();
      })
    );
    tbody.querySelectorAll('button[data-set]').forEach((b) =>
      b.addEventListener('click', async () => {
        const patch = { status: b.dataset.st };
        if (b.dataset.st === 'active') patch.trial_ends_at = null;
        const { error: e } = await sb.from('consultancies').update(patch).eq('id', b.dataset.set);
        if (e) return showToast(e.message);
        showToast(b.dataset.st === 'active' ? 'Acesso liberado.' : 'Acesso suspenso.');
        renderAdmin();
      })
    );
  }

  async function checkSources() {
    $('admin-kpi-sources').textContent = 'Verificando…';
    $('admin-kpi-sources-detail').textContent = '';
    const res = await Promise.all(GOV.ORDER.map((k) => GOV.ping(k)));
    const ok = res.filter((r) => r.ok).length;
    $('admin-kpi-sources').innerHTML = `<span class="w-2 h-2 rounded-full ${ok === res.length ? 'bg-[#00A0FF]' : 'bg-amber-400'} animate-pulse"></span> ${ok}/${res.length} fontes no ar`;
    $('admin-kpi-sources').className = `text-sm font-bold flex items-center gap-1.5 mt-1 ${ok === res.length ? 'text-[#00A0FF]' : 'text-amber-300'}`;
    $('admin-kpi-sources-detail').innerHTML = res
      .map((r) => `${r.ok ? '✅' : '⚠️'} ${esc(GOV.LAYERS[r.key].source)}${r.ok ? ` (${r.ms} ms)` : ` — ${esc(r.error)}`}`)
      .join('<br/>');
  }
  $('btn-check-sources')?.addEventListener('click', checkSources);

  $('btn-open-provider-admin')?.addEventListener('click', () => {
    renderAdmin();
    modalAdmin.classList.remove('hidden');
  });
  $('btn-close-provider-admin')?.addEventListener('click', () => modalAdmin.classList.add('hidden'));

  $('btn-admin-add-consultancy')?.addEventListener('click', async () => {
    const name = $('admin-new-cons-name').value.trim();
    const cnpj = $('admin-new-cons-cnpj').value.trim();
    const email = $('admin-new-cons-email').value.trim();
    const plan_id = $('admin-new-cons-plan').value;
    if (!name || !email) return showToast('Informe o nome da consultoria e o e-mail do responsável.');
    const { error } = await invokeUsers({ action: 'create_consultancy', name, cnpj, email, plan_id, rt_name: '' });
    if (error) return showToast(error);
    ['admin-new-cons-name', 'admin-new-cons-cnpj', 'admin-new-cons-email'].forEach((i) => ($(i).value = ''));
    showToast(`Empresa criada. Convite enviado para ${email} (o responsável define a senha pelo e-mail).`);
    renderAdmin();
  });

  // ---------------------------------------------------------------- Acesso (login, cadastro, sessão, assentos)
  const landingView = $('landing-page-view');
  const modalLogin = $('modal-auth-login');
  const modalTrial = $('modal-auth-trial');
  const trialBanner = $('trial-countdown-banner');

  function loginError(msg) {
    const el = $('login-error');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
    if (msg) {
      modalLogin.classList.remove('hidden');
      showToast(msg);
    }
  }

  const seatMessage = (r) =>
    ({
      seats_full: `Limite de ${r?.max ?? ''} acesso(s) simultâneo(s) do plano atingido. Peça a um colega para sair ou fale com o gestor para ampliar o plano.`,
      suspended: 'Acesso suspenso. Fale com o gestor do Panorama GIS.',
      trial_expired: 'Seu teste grátis de 7 dias terminou. Fale com o gestor do Panorama GIS para ativar a assinatura.',
      no_profile: 'Usuário sem perfil liberado. Fale com o gestor do Panorama GIS.',
    }[r?.reason] || 'Não foi possível liberar o acesso.');

  function applyRoleUI() {
    const isMaster = profile?.role === 'master' || (profile?.role === 'admin' && !profile?.consultancy_id);
    ['btn-open-clients-hub', 'btn-toggle-portal'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = isMaster ? 'none' : '';
    });
    ['btn-open-report-2', 'btn-download-layers-package'].forEach((id) => $(id)?.classList.toggle('hidden', isMaster));
    if ($('project-selector-container')) {
      $('project-selector-container').style.display = isMaster ? 'none' : '';
    }

    if (!isMaster && consultancy?.status === 'trial') {
      const d = Math.max(0, Math.ceil((new Date(consultancy.trial_ends_at) - Date.now()) / 86400000));
      $('trial-banner-text').innerHTML = `Teste grátis: restam <strong>${d} dia(s)</strong> no <strong>${esc(plan?.name || 'Plano Profissional')}</strong>.`;
      $('btn-activate-definitive').textContent = 'Falar com o gestor para ativar →';
      trialBanner?.classList.remove('hidden');
    } else {
      trialBanner?.classList.add('hidden');
    }

    syncUserProfileUI();
  }

  async function enterApp() {
    if (!sb) return false;
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return false;

    const { data: prof } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (!prof || !prof.active) {
      await sb.auth.signOut();
      loginError('Seu usuário ainda não tem acesso liberado. Fale com o gestor do Panorama GIS.');
      return false;
    }
    const { data: seat, error: seatErr } = await sb.rpc('claim_seat', { p_session: sessionId });
    if (seatErr || !seat?.ok) {
      await sb.auth.signOut();
      loginError(seatErr ? 'Erro ao validar acesso: ' + seatErr.message : seatMessage(seat));
      return false;
    }

    profile = prof;
    const { data: pl } = await sb.from('plans').select('*');
    plans = Object.fromEntries((pl || []).map((p) => [p.id, p]));

    GOV.setProxy(async (url, body) => {
      const { data, error } = await sb.functions.invoke('gov-proxy', { body: { url, body } });
      if (error) throw new Error('Proxy indisponível (' + error.message + ')');
      return typeof data === 'string' ? data : JSON.stringify(data);
    });

    const isMaster = profile.role === 'master' || (profile.role === 'admin' && !profile.consultancy_id);
    if (!isMaster && profile.consultancy_id) {
      const { data: c } = await sb.from('consultancies').select('*').eq('id', profile.consultancy_id).single();
      consultancy = c;
      plan = plans[c.plan_id];
      await loadProjects();
      refreshProjectSelector();
      selectProject(projects[0] || null);
    } else {
      selectProject(null);
    }

    applyRoleUI();
    syncHeaderBranding();
    modalLogin.classList.add('hidden');
    modalTrial.classList.add('hidden');
    landingView.classList.add('hidden');
    setTimeout(() => map.invalidateSize(), 150);

    clearInterval(heartbeat);
    heartbeat = setInterval(async () => {
      const { data } = await sb.rpc('claim_seat', { p_session: sessionId });
      if (!data?.ok) {
        showToast(seatMessage(data));
        await logout();
      }
    }, 60000);

    if (isMaster) {
      await renderAdmin();
      modalAdmin.classList.remove('hidden');
      checkSources();
    } else if (!projects.length) {
      showToast('Bem-vindo! Abra a "Área da Consultoria" para cadastrar seu primeiro projeto.');
    }
    return true;
  }

  async function logout() {
    clearInterval(heartbeat);
    try {
      await sb.rpc('release_seat', { p_session: sessionId });
      await sb.auth.signOut();
    } catch (e) {}
    location.href = location.pathname;
  }
  window.addEventListener('pagehide', () => {
    if (sb && profile) sb.rpc('release_seat', { p_session: sessionId });
  });

  // Modo Demonstração / Teste Local (Sem Conexão / Sem Login)
  function enterSandboxMode() {
    // Configura o proxy inteligente de contingÃªncia no Modo Sandbox / DemonstraÃ§Ã£o
    if (window.GOV && window.GOV.setProxy) {
      window.GOV.setProxy(async (url, body, key) => {
        if (sb && profile && profile.id !== 'demo-user-1') {
          try {
            const { data, error } = await sb.functions.invoke('gov-proxy', { body: { url, body } });
            if (!error && data) return typeof data === 'string' ? data : JSON.stringify(data);
          } catch (e) {}
        }
        // Retorna null no modo sandbox para permitir que o motor de análise tente fetch direto das bases públicas oficiais
        return null;
      });
    }
    try {
      if (modalLogin) modalLogin.classList.add('hidden');
      if (modalTrial) modalTrial.classList.add('hidden');
      const lv = $('landing-page-view') || landingView;
      if (lv) lv.classList.add('hidden');
    } catch (e) {
      console.warn('Erro ao ocultar landing/modais:', e);
    }

    let savedBrand = null;
    try {
      const s = localStorage.getItem('panorama_brand_config');
      if (s) savedBrand = JSON.parse(s);
    } catch (e) {}

    const defaultRt = 'Eng. Rodrigo Vasconcelos — CREA 123456/D';
    const rtVal = savedBrand?.rt_name || defaultRt;
    const cleanUserName = rtVal.split('—')[0].replace(/^Eng\.\s*(Florestal|Civil|Agrônomo|Ambiental)?\s*/i, '').trim() || 'Rodrigo Vasconcelos';

    plans = {
      iniciante: {
        id: 'iniciante',
        name: 'Iniciante (ASE)',
        max_projects: 20,
        max_seats: 1,
        price_monthly: 149,
        max_buffer_m: 5000,
        custom_brand: false,
        history_days: 90
      },
      profissional: {
        id: 'profissional',
        name: 'Profissional (ASE) ⭐ O Campeão',
        max_projects: 60,
        max_seats: 3,
        price_monthly: 297,
        max_buffer_m: 10000,
        custom_brand: true,
        history_days: 999999
      }
    };
    plans.essencial = plans.iniciante;
    plans.corporativo = plans.profissional;

    profile = {
      id: 'demo-user-1',
      role: 'consultoria',
      full_name: cleanUserName,
      email: 'rodrigo@suaconsultoria.com.br',
      is_owner: true,
      active: true,
    };
    consultancy = {
      id: 'demo-cons-1',
      name: savedBrand?.name || 'Consultoria Ambiental & Fundiária',
      brand_name: savedBrand?.name || 'Consultoria Ambiental & Fundiária',
      brand_slogan: savedBrand?.slogan || 'An\u00e1lise Socioambiental Expedita - ASE',
      brand_logo: savedBrand?.logo || null,
      plan_id: 'profissional',
      status: 'active',
      rt_name: rtVal,
    };
    plan = plans.profissional;
    projects = [
      {
        id: 'demo-proj-poly',
        name: 'Fazenda Primavera (Gleba Santa Maria)',
        client_name: 'Agropecuária Rio Verde S.A.',
        municipality: 'Rio Verde - GO',
        car_code: 'GO-5218805-2A84B97C2245D918353A',
        share_slug: 'demo-fazenda-primavera',
        share_pin: '1020',
        geom_type: 'Polygon',
        area_ha: 1265.4,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-50.955, -17.780],
            [-50.925, -17.780],
            [-50.925, -17.815],
            [-50.955, -17.815],
            [-50.955, -17.780]
          ]]
        },
        layers: [
          {
            id: 'demo-lyr-poly',
            name: 'Perímetro Fazenda Primavera (Polígono)',
            geom_type: 'Polygon',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-50.955, -17.780],
                [-50.925, -17.780],
                [-50.925, -17.815],
                [-50.955, -17.815],
                [-50.955, -17.780]
              ]]
            },
            color: '#10B981',
            visible: true,
            simulated_buffer_m: null,
            metrics: { area_ha: 1265.4, perimeter_km: 14.2 }
          }
        ]
      },
      {
        id: 'demo-proj-line',
        name: 'LT 230 kV Rio Verde – Eixo Sul',
        client_name: 'Transmissora Aliança Centro-Oeste',
        municipality: 'Rio Verde - GO',
        car_code: 'PROC-ANEEL-2026/0842-LT',
        share_slug: 'demo-lt-rio-verde',
        share_pin: '3040',
        geom_type: 'LineString',
        length_km: 6.45,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-50.950, -17.770],
            [-50.935, -17.795],
            [-50.920, -17.820]
          ]
        },
        layers: [
          {
            id: 'demo-lyr-line',
            name: 'Diretriz do Traçado (Linha)',
            geom_type: 'LineString',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-50.950, -17.770],
                [-50.935, -17.795],
                [-50.920, -17.820]
              ]
            },
            color: '#06b6d4',
            visible: true,
            simulated_buffer_m: 50,
            metrics: { length_m: 6450 }
          }
        ]
      },
      {
        id: 'demo-proj-point',
        name: 'Complexo Minerário & Espeleológico',
        client_name: 'Mineração Serra do Carste S.A.',
        municipality: 'Pedro Leopoldo - MG',
        car_code: 'ANM-830.412/2026',
        share_slug: 'demo-mineracao-lapa-vermelha',
        share_pin: '5060',
        geom_type: 'Point',
        geometry: {
          type: 'Point',
          coordinates: [-44.0204, -19.5862]
        },
        layers: [
          {
            id: 'demo-lyr-point',
            name: 'Planta de Moagem & Poço Central (Ponto)',
            geom_type: 'Point',
            geometry: {
              type: 'Point',
              coordinates: [-44.0204, -19.5862]
            },
            color: '#ec4899',
            visible: true,
            simulated_buffer_m: 2500,
            metrics: { lat: -19.5862, lon: -44.0204 }
          }
        ]
      }
    ];

    try {
      applyRoleUI();
      syncHeaderBranding();
      syncUserProfileUI();
      populateHubBrandFields();
      refreshProjectSelector();
      selectProject(projects[0]);
    } catch (e) {
      console.warn('Aviso na inicialização do sandbox:', e);
    }

    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) {}
    }, 150);
    showToast('Modo de Teste Local ativado! Adicione até 5 camadas, desenhe e faça cruzamentos com as bases oficiais ao vivo.');
  }

    // Suporte a abertura direta em Modo DemonstraÃ§Ã£o via URL (?demo=true)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
      setTimeout(() => {
        enterSandboxMode();
      }, 250);
    }
  } catch (e) {}
  window.enterSandboxMode = enterSandboxMode;
  $('btn-enter-sandbox')?.addEventListener('click', enterSandboxMode);
  $('btn-login-sandbox')?.addEventListener('click', enterSandboxMode);

    // Login
  // btn-landing-login opens login.html in new tab via target='_blank'
  ['btn-close-auth-login', 'btn-back-from-login'].forEach((id) => $(id)?.addEventListener('click', () => modalLogin?.classList.add('hidden')));
  $('btn-switch-to-trial')?.addEventListener('click', () => {
    modalLogin?.classList.add('hidden');
    modalTrial?.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  });
  $('btn-switch-to-login')?.addEventListener('click', () => {
    modalTrial?.classList.add('hidden');
    modalLogin?.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  });
  $('btn-submit-login')?.addEventListener('click', async () => {
    if (!sb) return loginError('Supabase ainda não configurado (config.js).');
    const email = $('login-email-input')?.value.trim();
    const password = $('login-pass-input')?.value;
    if (!email || !password) return loginError('Informe e-mail e senha.');
    loginError('');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return loginError(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message);
    await enterApp();
  });
  $('login-pass-input')?.addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-submit-login')?.click());
  $('btn-forgot')?.addEventListener('click', async () => {
    const email = $('login-email-input')?.value.trim();
    if (!sb || !email) return loginError('Digite seu e-mail no campo acima para receber o link de redefinição.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    showToast(error ? error.message : 'Enviamos um link de redefinição para o seu e-mail.');
  });

  // Teste grátis (cadastro)
  // trial buttons open signup.html in new tab via target='_blank'
  // Plan links open signup.html?plan=... in new tab directly

  // Navegação por Hash na Landing Page (Multi-Páginas)
  function handleLandingHash() {
    const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
    const validMap = {
      'solucoes': 'page-solucoes',
      'vantagens': 'page-vantagens',
      'produtos': 'page-produtos',
      'camadas': 'page-camadas',
      'planos': 'page-planos'
    };
    if (validMap[hash] && window.showLandingPage) {
      window.showLandingPage(validMap[hash]);
    }
  }
  window.addEventListener('hashchange', handleLandingHash);
  handleLandingHash();
    ['btn-close-auth-trial', 'btn-back-from-trial'].forEach((id) => $(id)?.addEventListener('click', () => modalTrial?.classList.add('hidden')));
  $('btn-submit-trial')?.addEventListener('click', async () => {
    if (!sb) return showToast('Supabase ainda nÃ£o configurado (config.js).');
    const company_name = $('trial-company-name')?.value.trim();
    const cnpj = $('trial-cnpj')?.value.trim() || '';
    const rt_name = $('trial-rt-name')?.value.trim() || '';
    const email = $('trial-email')?.value.trim();
    const password = $('trial-password')?.value;
    const confirmPass = $('trial-password-confirm')?.value;
    const plan_id = $('trial-plan-select')?.value || 'profissional';
    if (!company_name || !email) return showToast('Preencha o nome da empresa e o e-mail corporativo.');
    if (!password || password.length < 8) return showToast('A senha precisa ter no mÃ­nimo 8 caracteres.');
    if (confirmPass !== undefined && password !== confirmPass) return showToast('As senhas digitadas nÃ£o coincidem.');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { company_name, cnpj, rt_name, plan_id }, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) return showToast(error.message);
    if (data.session) return enterApp();
    modalTrial.classList.add('hidden');
    modalLogin.classList.remove('hidden');
    showToast('Quase lÃ¡! Enviamos um e-mail de confirmaÃ§Ã£o. Confirme e faÃ§a login para iniciar os 7 dias grÃ¡tis.');
  });
  $('btn-activate-definitive')?.addEventListener('click', () => showToast('Fale com o gestor do Panorama GIS para ativar sua assinatura definitiva.'));

  $('btn-show-landing')?.addEventListener('click', () => landingView?.classList.remove('hidden'));

  // ---------------------------------------------------------------- Portal do cliente (link + PIN)
  async function openSharedPortal(slug) {
    landingView?.classList.add('hidden');
    if (!sb) return alert('Sistema não configurado.');
    const pin = window.prompt('Informe o PIN de 4 dígitos enviado pela consultoria:');
    const { data } = pin ? await sb.rpc('get_shared_project', { p_slug: slug, p_pin: pin.trim() }) : { data: null };
    if (!data) {
      alert('Link ou PIN inválido.');
      location.href = location.pathname;
      return;
    }
    isSharedPortal = true;
    isClientPortalMode = true;
    sharedBrand = data.brand;
    currentProject = { ...data.project, share_slug: slug };
    ['btn-open-clients-hub', 'btn-toggle-portal', 'user-profile-menu-container'].forEach((id) => $(id)?.classList.add('hidden'));
    $('scenario-select')?.closest('div')?.classList.add('hidden');
    $('btn-copy-portal-link')?.classList.add('hidden');
    $('btn-run-all-analysis')?.classList.add('hidden');
    applyPortalUI();
    updateProjectPanel();
    $('portal-url-preview').textContent = '';
    if (currentProject.geometry) {
      const ring = polygonToRing(currentProject.geometry);
      currentRing = ring;
      drawPerimeter(ring);
      paintAnalysis(ring, currentProject.analysis?.cards || null, currentProject.analysis?.at || currentProject.analysis_at);
    }
    syncHeaderBranding();
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ---------------------------------------------------------------- Inicialização
  async function boot() {
    renderCards(null);
    renderRisk(null);
    const params = new URLSearchParams(location.search);
    if (params.get('p')) return openSharedPortal(params.get('p'));
    if (!sb) return;

    // Convite / redefinição: o link do e-mail traz uma sessão temporária — pedir a nova senha
    if (/type=(invite|recovery)/.test(location.hash)) {
      await new Promise((r) => setTimeout(r, 600)); // aguarda o supabase-js ler o token da URL
      let pwd = '';
      while (pwd.length < 8) {
        pwd = window.prompt('Defina sua senha de acesso (mínimo 8 caracteres):') || '';
        if (!pwd) break;
      }
      if (pwd.length >= 8) {
        const { error } = await sb.auth.updateUser({ password: pwd });
        showToast(error ? error.message : 'Senha definida com sucesso!');
      }
      history.replaceState(null, '', location.pathname);
    }
    await enterApp();
  }
  // ---------------------------------------------------------------- Novo Menu ASE (Screenshot 3) e Seguranca entre Abas
  const btnAseSettings = document.getElementById('btn-ase-settings');
  const aseDropdown = document.getElementById('ase-settings-dropdown');
  btnAseSettings?.addEventListener('click', (e) => {
    e.stopPropagation();
    aseDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (aseDropdown && !aseDropdown.classList.contains('hidden') && !document.getElementById('ase-config-container')?.contains(e.target)) {
      aseDropdown.classList.add('hidden');
    }
  });

  const openClientsHubHandler = () => {
    aseDropdown?.classList.add('hidden');
    renderHub();
    populateHubBrandFields();
    setHubTab('projects');
    document.getElementById('modal-clients-hub')?.classList.remove('hidden');
  };
  document.getElementById('menu-opt-clients-hub')?.addEventListener('click', openClientsHubHandler);
  document.getElementById('btn-config-clients-hub')?.addEventListener('click', openClientsHubHandler);

  const openProviderAdminHandler = () => {
    aseDropdown?.classList.add('hidden');
    renderAdmin();
    document.getElementById('modal-provider-admin')?.classList.remove('hidden');
  };
  document.getElementById('menu-opt-provider-admin')?.addEventListener('click', openProviderAdminHandler);
  document.getElementById('btn-config-provider-admin')?.addEventListener('click', openProviderAdminHandler);

  // Monitor de seguranca do ASE: se desautenticar na tela inicial, cessa operacoes
  function enforceAseSessionSecurity() {
    const isAseView = window.location.pathname.includes('ase.html') || window.location.search.includes('view=ase');
    if (!isAseView) return;
    const sessionStr = localStorage.getItem('panorama_session');
    const lockOverlay = document.getElementById('ase-security-lock-overlay');
    if (!sessionStr) {
      if (lockOverlay) lockOverlay.classList.remove('hidden');
      if (window.map) {
        try {
          window.map.dragging?.disable();
          window.map.touchZoom?.disable();
          window.map.doubleClickZoom?.disable();
          window.map.scrollWheelZoom?.disable();
        } catch(e) {}
      }
    } else {
      if (lockOverlay) lockOverlay.classList.add('hidden');
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'panorama_session' && !e.newValue) {
      enforceAseSessionSecurity();
    }
  });
  window.addEventListener('focus', enforceAseSessionSecurity);
  setInterval(enforceAseSessionSecurity, 1500);

  boot();
});


