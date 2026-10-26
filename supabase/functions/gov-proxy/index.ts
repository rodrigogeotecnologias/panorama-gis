// Edge Function: gov-proxy
// Repassa consultas WFS aos servidores da FUNAI e do IPHAN (que não liberam CORS para navegadores).
// Só aceita usuários logados e só encaminha para hosts oficiais da lista abaixo. Nada é armazenado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOW = new Set([
  'geoserver.funai.gov.br',
  'geoserver.iphan.gov.br',
  'geoservicos.ibge.gov.br',
  'geoservicos.inde.gov.br',
  'geoportal.incra.gov.br',
]);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response('unauthorized', { status: 401, headers: cors });

    const { url, body } = await req.json();
    const target = new URL(url);
    if (target.protocol !== 'https:' || !ALLOW.has(target.hostname)) {
      return new Response('host não permitido', { status: 403, headers: cors });
    }
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: typeof body === 'string' ? body : '',
      signal: AbortSignal.timeout(30000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.ok ? 200 : 502,
      headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: cors });
  }
});
