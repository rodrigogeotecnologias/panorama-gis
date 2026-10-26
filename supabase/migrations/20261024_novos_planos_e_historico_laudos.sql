-- ============================================================================
-- PANORAMA GIS — Migração: Novos Planos Comerciais (Iniciante & Profissional)
-- e Histórico de Laudos Técnicos Oficiais
-- Cole este script no SQL Editor do Supabase para atualizar bases existentes.
-- ============================================================================

-- 1. Atualizar colunas da tabela de planos
alter table public.plans add column if not exists max_buffer_m int not null default 10000;
alter table public.plans add column if not exists history_days int not null default 999999;

-- 2. Inserir / Atualizar os 2 Planos Oficiais do Produto ASE
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

-- 3. Atualizar regra da camada única (ao adicionar nova feição, apaga as anteriores)
create or replace function public.enforce_layer_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.project_layers where project_id = new.project_id;
  return new;
end $$;

-- 4. Criar tabela de Histórico de Laudos (Nuvem)
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

-- 5. Ativar RLS para Histórico de Laudos (isolamento rígido por consultoria)
alter table public.reports enable row level security;
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated using (consultancy_id = my_consultancy());
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (consultancy_id = my_consultancy());
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated using (consultancy_id = my_consultancy());
