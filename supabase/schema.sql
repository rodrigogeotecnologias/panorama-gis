-- ============================================================================
-- PANORAMA GIS — Banco de Dados Oficial (Supabase / PostgreSQL)
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
--
-- Matriz de Perfis (RBAC):
-- 1) 'master': Administrador Geral da Plataforma PANORAMA (Rodrigo / Sysadmin)
-- 2) 'admin': Gestor da Consultoria (Plano Profissional) ou Consultor Solo (Plano Iniciante)
-- 3) 'creator': Analista GIS / Colaborador da Equipe (Plano Profissional)
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ PLANOS
create table if not exists public.plans (
  id            text primary key,
  name          text not null,
  max_projects  int  not null,          -- diagnósticos de glebas / projetos por mês
  max_seats     int  not null,          -- acessos simultâneos permitidos (1 no Solo, 3 no Pro)
  price_monthly numeric(10,2) not null,
  custom_brand  boolean not null default false,  -- "Logo Personalizável no Laudo"
  max_buffer_m  int not null default 10000,      -- buffer máximo de análise (5.000m ou 10.000m)
  history_days  int not null default 999999      -- retenção de laudos em dias (90 ou permanente)
);

-- Planos Oficiais PANORAMA GIS
insert into public.plans (id, name, max_projects, max_seats, price_monthly, custom_brand, max_buffer_m, history_days) values
  ('iniciante',    'Iniciante (ASE)',    20, 1, 149.00, false, 5000, 90),
  ('profissional', 'Profissional (ASE)', 60, 3, 297.00, true,  10000, 999999),
  ('essencial',    'Iniciante (ASE)',    20, 1, 149.00, false, 5000, 90),
  ('corporativo',  'Profissional (ASE)', 60, 3, 297.00, true,  10000, 999999)
on conflict (id) do update set
  name = excluded.name,
  max_projects = excluded.max_projects,
  max_seats = excluded.max_seats,
  price_monthly = excluded.price_monthly,
  custom_brand = excluded.custom_brand,
  max_buffer_m = excluded.max_buffer_m,
  history_days = excluded.history_days;

-- ------------------------------------------------------------------ EMPRESAS DE CONSULTORIA
create table if not exists public.consultancies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  cnpj          text,
  contact_email text,
  rt_name       text,
  plan_id       text not null references public.plans(id) default 'iniciante',
  status        text not null default 'trial' check (status in ('trial','active','suspended')),
  trial_ends_at timestamptz,
  due_day       int default 10,
  brand_name    text,
  brand_slogan  text,
  brand_logo    text,                   -- data URL / imagem codificada
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ PERFIS (1 por usuário do Auth)
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           text not null default 'admin' check (role in ('master', 'admin', 'creator', 'consultoria')),
  consultancy_id uuid references public.consultancies(id) on delete cascade,
  full_name      text,
  email          text,
  is_owner       boolean not null default false,   -- gestor / titular da conta da consultoria
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint chk_company check (
    (role = 'master' and consultancy_id is null) or
    (role in ('admin', 'creator', 'consultoria') and consultancy_id is not null) or
    (role = 'admin' and consultancy_id is null) -- legado compatível com admin master antigo
  )
);

-- Índice único: apenas UM Administrador Master da Plataforma
drop index if exists public.one_admin;
drop index if exists public.one_master;
create unique index if not exists one_master on public.profiles(role)
  where (role = 'master' or (role = 'admin' and consultancy_id is null));

-- ------------------------------------------------------------------ PROJETOS
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  consultancy_id uuid not null references public.consultancies(id) on delete cascade,
  created_by     uuid references auth.users(id),
  client_name    text not null,
  name           text not null,
  municipality   text,
  car_code       text,
  geometry       jsonb,                 -- GeoJSON Polygon (lon/lat, SIRGAS 2000)
  area_ha        numeric,
  analysis       jsonb,                 -- último cruzamento socioambiental
  analysis_at    timestamptz,
  share_slug     text unique not null default encode(gen_random_bytes(8), 'hex'),
  share_pin      text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists projects_cons_idx on public.projects(consultancy_id);

-- ------------------------------------------------------------------ CAMADAS DO PROJETO (Vetor / Geometria)
create table if not exists public.project_layers (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  name                text not null,
  geom_type           text not null check (geom_type in ('Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon')),
  geometry            jsonb not null,
  color               text not null default '#21B66F',
  visible             boolean not null default true,
  simulated_buffer_m  numeric,                   -- Buffer paramétrico em metros
  metrics             jsonb,                     -- { area_ha: ..., length_m: ..., points_count: ... }
  analysis            jsonb,                     -- Diagnóstico de cruzamento espacial com bases oficiais
  analysis_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists proj_layers_idx on public.project_layers(project_id);

-- Regra da Camada Única PANORAMA GIS: 1 camada ativa por vez (ao adicionar nova, apaga a anterior)
create or replace function public.enforce_layer_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.project_layers where project_id = new.project_id;
  return new;
end $$;

drop trigger if exists trg_layer_limit on public.project_layers;
create trigger trg_layer_limit before insert on public.project_layers
  for each row execute function public.enforce_layer_limit();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_project_layers_touch on public.project_layers;
create trigger trg_project_layers_touch before update on public.project_layers
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ HISTÓRICO DE LAUDOS OFICIAIS (Nuvem)
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  consultancy_id uuid not null references public.consultancies(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete set null,
  created_by     uuid references auth.users(id),
  title          text not null,
  client_name    text,
  municipality   text,
  car_code       text,
  area_ha        numeric,
  analysis       jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists reports_cons_idx on public.reports(consultancy_id);

-- ------------------------------------------------------------------ ACESSOS SIMULTÂNEOS
create table if not exists public.active_sessions (
  session_id     text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  consultancy_id uuid references public.consultancies(id) on delete cascade,
  last_seen      timestamptz not null default now()
);

-- ------------------------------------------------------------------ FUNÇÕES AUXILIARES DE RBAC
create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and (role = 'master' or (role = 'admin' and consultancy_id is null))
  );
$$;

-- Compatibilidade
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_master();
$$;

create or replace function public.is_company_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and ((role = 'admin' and consultancy_id is not null) or is_owner)
  );
$$;

create or replace function public.my_consultancy() returns uuid
language sql stable security definer set search_path = public as $$
  select consultancy_id from public.profiles where id = auth.uid() and active;
$$;

-- Cadastro automático por teste grátis (Auto-atendimento no site)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cons uuid;
  v_plan text;
begin
  if coalesce(new.raw_user_meta_data ->> 'company_name', '') <> '' then
    v_plan := coalesce(new.raw_user_meta_data ->> 'plan_id', 'profissional');
    if not exists (select 1 from public.plans where id = v_plan) then
      v_plan := 'iniciante';
    end if;

    insert into public.consultancies (name, cnpj, contact_email, rt_name, plan_id, status, trial_ends_at)
    values (
      left(new.raw_user_meta_data ->> 'company_name', 120),
      left(new.raw_user_meta_data ->> 'cnpj', 30),
      new.email,
      left(coalesce(new.raw_user_meta_data ->> 'rt_name', new.raw_user_meta_data ->> 'company_name'), 120),
      v_plan,
      'trial',
      now() + interval '7 days'
    )
    returning id into v_cons;

    insert into public.profiles (id, role, consultancy_id, full_name, email, is_owner)
    values (
      new.id,
      'admin', -- Admin da Consultoria ou Admin Solo Iniciante
      v_cons,
      left(coalesce(new.raw_user_meta_data ->> 'rt_name', new.raw_user_meta_data ->> 'company_name'), 120),
      new.email,
      true
    );
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Limite de projetos do plano + bloqueio de conta suspensa / teste vencido
create or replace function public.enforce_project_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_status text; v_trial timestamptz; v_count int;
begin
  select p.max_projects, c.status, c.trial_ends_at into v_max, v_status, v_trial
    from public.consultancies c join public.plans p on p.id = c.plan_id where c.id = new.consultancy_id;
  if v_status = 'suspended' then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if v_status = 'trial' and v_trial < now() then raise exception 'TRIAL_EXPIRED'; end if;
  select count(*) into v_count from public.projects where consultancy_id = new.consultancy_id and not archived;
  if v_count >= v_max then raise exception 'PROJECT_QUOTA_EXCEEDED'; end if;
  return new;
end $$;

drop trigger if exists trg_project_quota on public.projects;
create trigger trg_project_quota before insert on public.projects
  for each row execute function public.enforce_project_quota();

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ CONTROLE DE ACESSOS SIMULTÂNEOS
create or replace function public.claim_seat(p_session text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prof public.profiles;
  v_cons public.consultancies;
  v_plan public.plans;
  v_count int;
begin
  select * into v_prof from public.profiles where id = auth.uid() and active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;

  -- Master da plataforma não ocupa vaga de consultoria
  if v_prof.role = 'master' or (v_prof.role = 'admin' and v_prof.consultancy_id is null) then
    return jsonb_build_object('ok', true, 'role', 'master');
  end if;

  select * into v_cons from public.consultancies where id = v_prof.consultancy_id;
  if v_cons.status = 'suspended' then return jsonb_build_object('ok', false, 'reason', 'suspended'); end if;
  if v_cons.status = 'trial' and v_cons.trial_ends_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'trial_expired');
  end if;
  select * into v_plan from public.plans where id = v_cons.plan_id;

  perform pg_advisory_xact_lock(hashtext(v_cons.id::text));
  delete from public.active_sessions where last_seen < now() - interval '3 minutes';

  if exists (select 1 from public.active_sessions where session_id = p_session and user_id = auth.uid()) then
    update public.active_sessions set last_seen = now() where session_id = p_session;
  else
    select count(*) into v_count from public.active_sessions where consultancy_id = v_cons.id;
    if v_count >= v_plan.max_seats then
      return jsonb_build_object('ok', false, 'reason', 'seats_full', 'max', v_plan.max_seats);
    end if;
    insert into public.active_sessions (session_id, user_id, consultancy_id) values (p_session, auth.uid(), v_cons.id);
  end if;

  select count(*) into v_count from public.active_sessions where consultancy_id = v_cons.id;
  return jsonb_build_object('ok', true, 'role', v_prof.role, 'seats_used', v_count, 'seats_max', v_plan.max_seats);
end $$;

create or replace function public.release_seat(p_session text) returns void
language sql security definer set search_path = public as $$
  delete from public.active_sessions where session_id = p_session and user_id = auth.uid();
$$;

create or replace function public.my_seat_usage() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cons uuid := my_consultancy();
  v_used int;
  v_max int;
begin
  if v_cons is null then return null; end if;
  select count(*) into v_used from public.active_sessions where consultancy_id = v_cons and last_seen > now() - interval '3 minutes';
  select p.max_seats into v_max from public.consultancies c join public.plans p on p.id = c.plan_id where c.id = v_cons;
  return jsonb_build_object('used', v_used, 'max', v_max);
end $$;

-- ------------------------------------------------------------------ VISÃO DO MASTER (Métricas e Auditoria — sem violação de mapas)
create or replace function public.admin_overview()
returns table (
  id uuid, name text, cnpj text, contact_email text, rt_name text, plan_id text, status text,
  trial_ends_at timestamptz, due_day int, created_at timestamptz,
  projects_count bigint, users_count bigint, seats_in_use bigint,
  max_projects int, max_seats int, price_monthly numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'forbidden'; end if;
  return query
  select c.id, c.name, c.cnpj, c.contact_email, c.rt_name, c.plan_id, c.status,
         c.trial_ends_at, c.due_day, c.created_at,
         (select count(*) from public.projects pr where pr.consultancy_id = c.id and not pr.archived),
         (select count(*) from public.profiles pf where pf.consultancy_id = c.id and pf.active),
         (select count(*) from public.active_sessions s where s.consultancy_id = c.id and s.last_seen > now() - interval '3 minutes'),
         p.max_projects, p.max_seats, p.price_monthly
  from public.consultancies c join public.plans p on p.id = c.plan_id
  order by c.created_at desc;
end $$;

-- ------------------------------------------------------------------ MARCA PRÓPRIA (somente gestor da conta e plano com custom_brand)
create or replace function public.update_brand(p_name text, p_slogan text, p_rt text, p_logo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prof public.profiles;
  v_custom boolean;
begin
  select * into v_prof from public.profiles where id = auth.uid() and active;
  if not found or not (v_prof.role = 'admin' or v_prof.is_owner) then
    raise exception 'Apenas o gestor da conta pode alterar a marca';
  end if;
  select p.custom_brand into v_custom from public.consultancies c join public.plans p on p.id = c.plan_id where c.id = v_prof.consultancy_id;
  if p_logo is not null and length(p_logo) > 400000 then raise exception 'Logomarca muito grande (máx. ~300 KB)'; end if;
  update public.consultancies set
    rt_name = coalesce(nullif(p_rt, ''), rt_name),
    brand_name   = case when v_custom then nullif(p_name, '')   else brand_name end,
    brand_slogan = case when v_custom then nullif(p_slogan, '') else brand_slogan end,
    brand_logo   = case when v_custom then p_logo               else brand_logo end
  where id = v_prof.consultancy_id;
end $$;

-- ------------------------------------------------------------------ PORTAL DO CLIENTE (link + PIN, modo leitura)
create or replace function public.get_shared_project(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v_layers jsonb;
begin
  select pr.id, pr.client_name, pr.name, pr.municipality, pr.car_code, pr.geometry, pr.area_ha, pr.analysis, pr.analysis_at,
         c.name as cname, c.brand_name, c.brand_slogan, c.brand_logo, c.rt_name, c.status as cstatus, p.custom_brand
    into r
    from public.projects pr join public.consultancies c on c.id = pr.consultancy_id join public.plans p on p.id = c.plan_id
   where pr.share_slug = p_slug and pr.share_pin = p_pin and not pr.archived;
  if not found or r.cstatus = 'suspended' then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name, 'geom_type', l.geom_type, 'geometry', l.geometry,
           'color', l.color, 'visible', l.visible, 'simulated_buffer_m', l.simulated_buffer_m,
           'metrics', l.metrics, 'analysis', l.analysis, 'analysis_at', l.analysis_at
         ) order by l.created_at asc), '[]'::jsonb)
    into v_layers
    from public.project_layers l
   where l.project_id = r.id;

  return jsonb_build_object(
    'project', jsonb_build_object('id', r.id, 'client_name', r.client_name, 'name', r.name, 'municipality', r.municipality,
               'car_code', r.car_code, 'geometry', r.geometry, 'area_ha', r.area_ha, 'analysis', r.analysis, 'analysis_at', r.analysis_at,
               'layers', v_layers),
    'brand', jsonb_build_object(
               'name',   case when r.custom_brand then coalesce(r.brand_name, r.cname) else r.cname end,
               'slogan', case when r.custom_brand then r.brand_slogan end,
               'logo',   case when r.custom_brand then r.brand_logo end,
               'rt_name', r.rt_name));
end $$;
grant execute on function public.get_shared_project(text, text) to anon, authenticated;

-- ------------------------------------------------------------------ SEGURANÇA (Row Level Security - RLS)
alter table public.plans           enable row level security;
alter table public.consultancies   enable row level security;
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_layers  enable row level security;
alter table public.reports         enable row level security;
alter table public.active_sessions enable row level security;

-- Planos: leitura pública para autenticados; edição exclusiva do Master
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);
drop policy if exists plans_admin on public.plans;
create policy plans_admin on public.plans for update to authenticated using (is_master()) with check (is_master());

-- Consultorias: visualização do Master ou da própria empresa; edição do Master
drop policy if exists cons_read on public.consultancies;
create policy cons_read on public.consultancies for select to authenticated
  using (is_master() or id = my_consultancy());
drop policy if exists cons_admin_update on public.consultancies;
create policy cons_admin_update on public.consultancies for update to authenticated
  using (is_master()) with check (is_master());

-- Perfis: visualização do próprio usuário, do Master ou de membros da mesma consultoria
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_master() or consultancy_id = my_consultancy());

-- Projetos: isolamento total por consultoria. O Master NÃO visualiza mapas (privacidade garantida)
drop policy if exists proj_select on public.projects;
create policy proj_select on public.projects for select to authenticated using (consultancy_id = my_consultancy());
drop policy if exists proj_insert on public.projects;
create policy proj_insert on public.projects for insert to authenticated
  with check (consultancy_id = my_consultancy() and created_by = auth.uid());
drop policy if exists proj_update on public.projects;
create policy proj_update on public.projects for update to authenticated
  using (consultancy_id = my_consultancy()) with check (consultancy_id = my_consultancy());
drop policy if exists proj_delete on public.projects;
create policy proj_delete on public.projects for delete to authenticated
  using (consultancy_id = my_consultancy() and (is_company_admin() or created_by = auth.uid()));

-- Camadas do Projeto: isolamento por consultoria
drop policy if exists layers_select on public.project_layers;
create policy layers_select on public.project_layers for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.consultancy_id = my_consultancy()));
drop policy if exists layers_insert on public.project_layers;
create policy layers_insert on public.project_layers for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.consultancy_id = my_consultancy()));
drop policy if exists layers_update on public.project_layers;
create policy layers_update on public.project_layers for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.consultancy_id = my_consultancy()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.consultancy_id = my_consultancy()));
drop policy if exists layers_delete on public.project_layers;
create policy layers_delete on public.project_layers for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.consultancy_id = my_consultancy()));

-- Laudos Oficiais: isolamento por consultoria
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated using (consultancy_id = my_consultancy());
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (consultancy_id = my_consultancy());
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using (consultancy_id = my_consultancy() and (is_company_admin() or created_by = auth.uid()));

-- ------------------------------------------------------------------ COMO ATIVAR SEU USUÁRIO MASTER
-- 1) No painel do Supabase > Authentication > Users > Add user
--    Crie o seu usuário (ex: rodrigo@panoramagis.com.br) e marque "Auto Confirm".
-- 2) Execute no SQL Editor (substituindo pelo seu e-mail cadastrado):
--
-- insert into public.profiles (id, role, full_name, email, is_owner, active)
-- select id, 'master', 'Rodrigo Vasconcelos (Master)', email, true, true
-- from auth.users where email = 'SEU_EMAIL_AQUI@dominio.com'
-- on conflict (id) do update set role = 'master', consultancy_id = null;
