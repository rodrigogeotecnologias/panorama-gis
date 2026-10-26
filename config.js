// ============================================================================
// PANORAMA GIS — Configuração de Conexão Nuvem (Supabase & Vercel)
// ============================================================================
// As chaves públicas abaixo são seguras no navegador pois toda a segurança
// e isolamento multi-tenant são garantidos pelo PostgreSQL RLS (Row Level Security).
// NUNCA coloque aqui a chave "service_role".

window.PANORAMA_CONFIG = {
  SUPABASE_URL: 'https://nyoyqquyjlrrsghxqzsn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55b3lxcXV5amxycnNnaHhxenNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDkzNzcsImV4cCI6MjEwODYyNTM3N30.l5OW4tGmAgYr_l0NDA7nqzwgsxxW0fhNQc0egNDQdLw',
};

// Aliases para máxima compatibilidade entre todos os módulos e páginas
window.CONFIG = {
  supabaseUrl: window.PANORAMA_CONFIG.SUPABASE_URL,
  supabaseAnonKey: window.PANORAMA_CONFIG.SUPABASE_ANON_KEY,
};
