// ============================================================================
// PANORAMA GIS — Configuração de Conexão Nuvem (Supabase & Vercel)
// ============================================================================
// As chaves públicas abaixo são seguras no navegador pois toda a segurança
// e isolamento multi-tenant são garantidos pelo PostgreSQL RLS (Row Level Security).
// NUNCA coloque aqui a chave "service_role".

window.PANORAMA_CONFIG = {
  SUPABASE_URL: 'https://api.panoramagis.com.br',
  SUPABASE_ANON_KEY: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MzIzNDUyMCwiZXhwIjo0OTQ4OTA4MTIwLCJyb2xlIjoiYW5vbiJ9.msjXyWpquKGlCjwClR7mhbsuEfEdCN8nqkLQLkeXSOw',
};

// Aliases para máxima compatibilidade entre todos os módulos e páginas
window.CONFIG = {
  supabaseUrl: window.PANORAMA_CONFIG.SUPABASE_URL,
  supabaseAnonKey: window.PANORAMA_CONFIG.SUPABASE_ANON_KEY,
};
