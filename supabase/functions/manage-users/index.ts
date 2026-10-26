// Edge Function: manage-users
// Operações que exigem a chave service_role (nunca exposta no navegador):
//   create_consultancy  -> só o MASTER da plataforma: cria a empresa + convida o responsável por e-mail
//   add_member          -> MASTER ou ADMIN da empresa: convida um colaborador (creator)
//   set_member_active   -> MASTER ou ADMIN da empresa: ativa/desativa um colaborador
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: unknown) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autenticado' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const redirectTo = Deno.env.get('SITE_URL') || undefined;

    const { data: me } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (!me || !me.active) return json({ error: 'Perfil inativo' }, 403);

    const isMaster = me.role === 'master' || (me.role === 'admin' && !me.consultancy_id);
    const body = await req.json();

    // 1. Criar Consultoria (Exclusivo Master)
    if (body.action === 'create_consultancy') {
      if (!isMaster) return json({ error: 'Apenas o Administrador Master pode cadastrar novas empresas' }, 403);
      const { name, cnpj, email, plan_id, rt_name } = body;
      if (!name || !emailOk(email)) return json({ error: 'Informe a razão social e um e-mail válido' }, 400);
      const { data: plan } = await admin.from('plans').select('id').eq('id', plan_id).maybeSingle();
      if (!plan) return json({ error: 'Plano inválido' }, 400);

      const { data: cons, error: e1 } = await admin.from('consultancies')
        .insert({ name, cnpj, contact_email: email, rt_name, plan_id, status: 'active' }).select().single();
      if (e1) return json({ error: e1.message }, 400);

      const { data: inv, error: e2 } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (e2) {
        await admin.from('consultancies').delete().eq('id', cons.id);
        return json({ error: e2.message }, 400);
      }
      await admin.from('profiles').insert({
        id: inv.user.id, role: 'admin', consultancy_id: cons.id,
        full_name: rt_name || name, email, is_owner: true,
      });
      return json({ ok: true, consultancy: cons });
    }

    // 2. Convidar Criador / Membro da Equipe (Creator)
    if (body.action === 'add_member') {
      const consId = isMaster ? body.consultancy_id : me.consultancy_id;
      if (!consId) return json({ error: 'Empresa não informada' }, 400);

      const isCompanyAdmin = isMaster || (me.is_owner || me.role === 'admin');
      if (!isCompanyAdmin) return json({ error: 'Apenas o gestor da empresa pode convidar membros' }, 403);
      if (!emailOk(body.email)) return json({ error: 'E-mail corporativo inválido' }, 400);

      // Validação de Plano e Limite de Vagas (Seats)
      const { data: cons } = await admin.from('consultancies').select('*, plans(*)').eq('id', consId).single();
      if (!cons) return json({ error: 'Consultoria não encontrada' }, 404);

      const maxSeats = cons.plans?.max_seats || 1;
      if (maxSeats <= 1) {
        return json({
          error: 'O Plano Iniciante é exclusivo para 1 consultor individual. Para adicionar criadores à sua equipe, faça upgrade para o Plano Profissional.'
        }, 400);
      }

      const { count: currentMembers } = await admin.from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('consultancy_id', consId)
        .eq('active', true);

      if ((currentMembers || 0) >= maxSeats) {
        return json({
          error: `Limite de usuários atingido para este plano (máximo ${maxSeats} usuários simultâneos).`
        }, 400);
      }

      const { data: inv, error } = await admin.auth.admin.inviteUserByEmail(body.email, { redirectTo });
      if (error) return json({ error: error.message }, 400);

      await admin.from('profiles').insert({
        id: inv.user.id,
        role: 'creator', // Papel Creator (Analista GIS)
        consultancy_id: consId,
        full_name: body.full_name || body.email,
        email: body.email,
        is_owner: false,
      });
      return json({ ok: true });
    }

    // 3. Ativar / Desativar Membro da Equipe
    if (body.action === 'set_member_active') {
      const { data: target } = await admin.from('profiles').select('*').eq('id', body.user_id).maybeSingle();
      if (!target || target.role === 'master') return json({ error: 'Usuário inválido' }, 400);
      const allowed = isMaster || ((me.is_owner || me.role === 'admin') && target.consultancy_id === me.consultancy_id);
      if (!allowed) return json({ error: 'Sem permissão para alterar este membro' }, 403);
      if (target.id === me.id) return json({ error: 'Você não pode desativar o próprio acesso' }, 400);

      await admin.from('profiles').update({ active: !!body.active }).eq('id', target.id);
      if (!body.active) await admin.from('active_sessions').delete().eq('user_id', target.id);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
