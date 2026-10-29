// ============================================================================
// PANORAMA GIS — Configuração de Conexão Nuvem (Supabase & Self-Hosted VPS)
// ============================================================================
// As chaves públicas abaixo são seguras no navegador pois toda a segurança
// e isolamento multi-tenant são garantidos pelo PostgreSQL RLS (Row Level Security).
// NUNCA coloque aqui a chave "service_role".

window.PANORAMA_CONFIG = {
  SUPABASE_URL: 'https://api.panoramagis.com.br',
  SUPABASE_ANON_KEY: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MzIzNDUyMCwiZXhwIjo0OTQ4OTA4MTIwLCJyb2xlIjoiYW5vbiJ9.msjXyWpquKGlCjwClR7mhbsuEfEdCN8nqkLQLkeXSOw',
  HOMOLOG_GATE_ENABLED: true,
  HOMOLOG_HASH: '0c5346387b3a119cd6300fef327b2c01475f34e610afe6c2a2e6e931df18a9c7',
};

// Aliases para máxima compatibilidade entre todos os módulos e páginas
window.CONFIG = {
  supabaseUrl: window.PANORAMA_CONFIG.SUPABASE_URL,
  supabaseAnonKey: window.PANORAMA_CONFIG.SUPABASE_ANON_KEY,
};

// ============================================================================
// CORTINA DE HOMOLOGAÇÃO (ACESSO RESTRITO AO ADMINISTRADOR)
// ============================================================================
(function initHomologationGate() {
  if (!window.PANORAMA_CONFIG.HOMOLOG_GATE_ENABLED) return;
  if (window.__pgisGateInitialized) return;
  window.__pgisGateInitialized = true;

  var STORAGE_KEY = 'panorama_homolog_unlocked_v1';
  var EXPECTED_TOKEN = '0c534638';

  function isUnlocked() {
    try {
      return localStorage.getItem(STORAGE_KEY) === EXPECTED_TOKEN;
    } catch (e) {
      return false;
    }
  }

  window.lockPanoramaHomolog = function () {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    window.location.reload();
  };

  if (isUnlocked()) {
    return;
  }

  // Oculta imediatamente qualquer conteúdo da página antes da renderização
  var hideStyle = document.createElement('style');
  hideStyle.id = 'pgis-homolog-hide-style';
  hideStyle.textContent =
    'html, body { background: #0f1e32 !important; overflow: hidden !important; } ' +
    'body > *:not(#pgis-homolog-gate) { display: none !important; }';
  (document.head || document.documentElement).appendChild(hideStyle);

  async function verifyPassword(pwd) {
    var clean = (pwd || '').trim();
    if (!clean) return false;
    try {
      if (window.crypto && window.crypto.subtle) {
        var enc = new TextEncoder().encode(clean);
        var buf = await window.crypto.subtle.digest('SHA-256', enc);
        var hex = Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
        return hex === window.PANORAMA_CONFIG.HOMOLOG_HASH;
      }
    } catch (e) {}
    return false;
  }

  function mountGate() {
    if (document.getElementById('pgis-homolog-gate')) return;
    if (!document.body) {
      setTimeout(mountGate, 15);
      return;
    }

    var gate = document.createElement('div');
    gate.id = 'pgis-homolog-gate';
    gate.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:radial-gradient(circle at 50% 20%, #1c3557 0%, #0d1b2e 70%, #07101c 100%);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:"Plus Jakarta Sans",system-ui,-apple-system,sans-serif;color:#ffffff;';

    gate.innerHTML =
      '<div style="max-width:440px;width:100%;background:rgba(19,36,58,0.92);border:1px solid rgba(0,160,255,0.28);border-radius:24px;padding:36px 32px;box-shadow:0 25px 60px rgba(0,0,0,0.65);text-align:center;backdrop-filter:blur(12px);">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:20px;">' +
          '<img src="assets/branding/atuais/Panorama_GIS_Emblema_Transparente.png" alt="PANORAMA GIS" style="height:52px;width:auto;object-fit:contain;" onerror="this.style.display=\'none\'" />' +
          '<div style="text-align:left;">' +
            '<div style="font-size:22px;font-weight:900;letter-spacing:-0.02em;color:#fff;line-height:1.1;">PANORAMA <span style="color:#00A0FF;">GIS</span></div>' +
            '<div style="font-size:11px;color:#8eb2d9;font-weight:600;margin-top:2px;">Ampliando a Visão do seu Negócio</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:rgba(0,160,255,0.14);border:1px solid rgba(0,160,255,0.35);color:#5ec2ff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;">' +
          '<span style="width:7px;height:7px;border-radius:50%;background:#00A0FF;display:inline-block;"></span>' +
          '<span>Ambiente em Homologação</span>' +
        '</div>' +
        '<h1 style="font-size:18px;font-weight:800;color:#ffffff;margin:0 0 10px 0;">Acesso Restrito à Equipe Técnica</h1>' +
        '<p style="font-size:12.5px;line-height:1.6;color:#b8d0eb;margin:0 0 24px 0;">' +
          'A plataforma corporativa <strong>PANORAMA GIS</strong> (Enterprise WebGIS &amp; Geospatial Intelligence) encontra-se em fase final de configuração para lançamento público.' +
        '</p>' +
        '<form id="pgis-homolog-form" style="display:flex;flex-direction:column;gap:12px;text-align:left;">' +
          '<label style="font-size:11px;font-weight:700;color:#9bb8da;text-transform:uppercase;letter-spacing:0.05em;">Credencial do Administrador</label>' +
          '<div style="position:relative;">' +
            '<input id="pgis-homolog-pwd" type="password" placeholder="Digite sua senha de acesso..." required ' +
              'style="width:100%;box-sizing:border-box;background:#0e1e33;border:1px solid #2b4c75;border-radius:12px;padding:12px 42px 12px 14px;color:#fff;font-size:13px;outline:none;" />' +
            '<button type="button" id="pgis-homolog-toggle" title="Mostrar/Ocultar" ' +
              'style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#7fa3c9;font-size:11px;font-weight:700;cursor:pointer;padding:4px;">Ver</button>' +
          '</div>' +
          '<div id="pgis-homolog-err" style="display:none;font-size:12px;font-weight:600;color:#fda4af;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.3);border-radius:10px;padding:8px 12px;text-align:center;">' +
            'Senha incorreta. Acesso exclusivo à administração.' +
          '</div>' +
          '<button type="submit" ' +
            'style="width:100%;background:#00A0FF;color:#ffffff;font-weight:800;font-size:13px;border:none;border-radius:12px;padding:13px 16px;cursor:pointer;box-shadow:0 8px 20px rgba(0,160,255,0.3);transition:all 0.15s;">' +
            'Desbloquear Ambiente' +
          '</button>' +
        '</form>' +
        '<div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#6f90b5;">' +
          '&copy; 2026 PANORAMA GIS &bull; Contato: rodrigo@panoramagis.com.br' +
        '</div>' +
      '</div>';

    document.body.appendChild(gate);

    var pwdInput = document.getElementById('pgis-homolog-pwd');
    var toggleBtn = document.getElementById('pgis-homolog-toggle');
    var form = document.getElementById('pgis-homolog-form');
    var errBox = document.getElementById('pgis-homolog-err');

    if (toggleBtn && pwdInput) {
      toggleBtn.addEventListener('click', function () {
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          toggleBtn.textContent = 'Ocultar';
        } else {
          pwdInput.type = 'password';
          toggleBtn.textContent = 'Ver';
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var ok = await verifyPassword(pwdInput ? pwdInput.value : '');
        if (ok) {
          try {
            localStorage.setItem(STORAGE_KEY, EXPECTED_TOKEN);
          } catch (err) {}
          var st = document.getElementById('pgis-homolog-hide-style');
          if (st) st.remove();
          gate.remove();
          if (window.map && typeof window.map.invalidateSize === 'function') {
            setTimeout(function () { window.map.invalidateSize(); }, 150);
          }
        } else {
          if (errBox) errBox.style.display = 'block';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountGate);
  } else {
    mountGate();
  }
})();
