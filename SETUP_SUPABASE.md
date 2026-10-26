# Guia de Configuração & Deploy — PANORAMA GIS (Supabase + Vercel + GitHub)

Este guia orienta o provisionamento da infraestrutura do **PANORAMA GIS** no **Supabase** (Autenticação, Banco PostgreSQL com RLS, Controle de Acessos Simultâneos e Motor PostGIS) e a publicação online via **Vercel** com repositório no **GitHub**.

---

## 1. Criar o Projeto no Supabase

1. Acesse [https://supabase.com](https://supabase.com) e entre na sua conta (ou crie uma gratuitamente).
2. Clique em **"New Project"**.
3. Defina:
   - **Name:** `panorama-gis`
   - **Database Password:** crie uma senha segura e anote.
   - **Region:** `South America (São Paulo)` para menor latência no Brasil.
4. Aguarde ~1 a 2 minutos até o provisionamento do projeto ser concluído.

---

## 2. Configurar as Chaves no Frontend (`config.js`)

1. No painel do seu projeto no Supabase, vá em **Project Settings** (ícone de engrenagem) > **API**.
2. Copie os valores:
   - **Project URL** (ex: `https://xyzcompany.supabase.co`)
   - **Project API keys** > `anon` `public` (chave que começa com `eyJ...`)
3. Abra o arquivo `config.js` na raiz do PANORAMA GIS e preencha:

```javascript
window.PANORAMA_CONFIG = {
  SUPABASE_URL: 'https://SEU_PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'SUA_CHAVE_ANON_AQUI',
};

window.CONFIG = {
  supabaseUrl: window.PANORAMA_CONFIG.SUPABASE_URL,
  supabaseAnonKey: window.PANORAMA_CONFIG.SUPABASE_ANON_KEY,
};
```

> **Atenção:** A chave `anon` é segura para ficar no frontend porque o acesso a dados é rigidamente protegido pelas políticas de **RLS (Row Level Security)** do PostgreSQL. **Nunca** coloque a chave `service_role` no frontend.

---

## 3. Criar as Tabelas e Políticas (SQL Editor)

1. No painel do Supabase, clique em **SQL Editor** no menu lateral esquerdo.
2. Clique em **"New query"**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo e cole no editor do Supabase.
4. Clique em **"Run"** (ou aperte `Ctrl + Enter`).
5. A mensagem `Success. No rows returned` confirmará a criação de:
   - Tabela `plans` com os planos comerciais (**Iniciante** e **Profissional**).
   - Tabela `consultancies` (empresas clientes com controle de dias de teste e status).
   - Tabela `profiles` com suporte a **Master**, **Admin** e **Creator**.
   - Tabela `projects` com isolamento total entre consultorias (o Master **não** tem acesso aos mapas dos clientes para resguardar sigilo).
   - Tabela `project_layers` com persistência das geometrias GeoJSON, métricas e análises espaciais.
   - Tabela `active_sessions` e funções `claim_seat` / `release_seat` para controle atômico de sessões simultâneas por plano.
   - Triggers automáticos para criação de conta e limite de projetos por cota contratada.

---

## 4. Criar o Administrador Master (Gestor da Plataforma)

O sistema possui uma matriz de papéis rigorosa (RBAC):
- **`master`:** Administrador Geral do PANORAMA GIS (Rodrigo). Acesso ao painel global de métricas (`admin_overview`), faturamento MRR, consultorias ativas, bloqueio/desbloqueio e auditoria.
- **`admin`:** Gestor da Consultoria (Plano Profissional) ou Consultor Individual (Plano Iniciante).
- **`creator`:** Analista GIS / Colaborador da Equipe (exclusivo do Plano Profissional).

### Passo a passo para criar o Master:
1. No menu lateral do Supabase, vá em **Authentication** > **Users**.
2. Clique em **"Add user"** > **"Create user"**.
3. Preencha seu e-mail e crie uma senha forte.
4. Marque a opção **"Auto Confirm User?"** para `Yes` (assim você não precisa confirmar e-mail de ativação).
5. Clique em **"Create user"**.
6. Volte ao **SQL Editor**, abra uma nova aba e execute o comando abaixo (substituindo pelo seu e-mail):

```sql
insert into public.profiles (id, role, full_name, email, is_owner, active)
select id, 'master', 'Rodrigo Vasconcelos (Master)', email, true, true
from auth.users
where email = 'SEU_EMAIL_AQUI@dominio.com'
on conflict (id) do update set role = 'master', consultancy_id = null;
```

Pronto! Seu perfil de **Administrador Master** está ativo. Ao fazer login, você terá acesso ao Painel da Plataforma.

---

## 5. Como as Consultorias e Usuários entram no Sistema?

### Caso 1: Consultor Individual (Plano Iniciante)
- O usuário se cadastra pelo site selecionando o **Plano Iniciante** (ou via `/signup.html?plan=iniciante`).
- Automaticamente o sistema provisiona a conta com `plan_id = 'iniciante'` e cria o usuário com papel **`admin` (Solo)** e `max_seats = 1`.
- Ele tem acesso total a vetorização, diagnósticos ASE de até 5.000m e relatórios. Se tentar adicionar membros, o sistema exibe o cartão para upgrade.

### Caso 2: Empresa de Consultoria (Plano Profissional)
- O usuário se cadastra pelo site selecionando o **Plano Profissional** (ou via `/signup.html?plan=profissional`).
- Automaticamente o sistema provisiona a consultoria com `plan_id = 'profissional'`, `max_seats = 3` e cria o titular como **`admin` (Gestor da Consultoria)**.
- O Gestor acessa a **"Área da Consultoria"** e:
  1. Personaliza a **Marca da Consultoria** (logomarca oficial, slogan e dados de Responsável Técnico).
  2. Na aba **"Minha Equipe"**, convida até 2 colaboradores por e-mail com papel **`creator` (Analista GIS)**.
- Os criadores logados herdam a logomarca da empresa e realizam análises espaciais de até 10.000m.

### Caso 3: Cadastrada pelo Administrador Master
- No painel Master (`modal-provider-admin`), o gestor pode cadastrar novas empresas, alterar o plano contratado (Iniciante ou Profissional) e definir o status (`active` ou `suspended`).

---

## 6. Publicação Online com GitHub e Vercel

O projeto foi preparado para deploy estático ultra-rápido na **Vercel** com integração contínua (CI/CD) via **GitHub**.

### Passo 1: Inicializar o Repositório Git Local
Abra o terminal do PowerShell nesta pasta e execute:

```powershell
git init
git add .
git commit -m "feat: release v1 panorama gis com rbac supabase e suporte vercel"
```

### Passo 2: Criar Repositório no GitHub
1. Acesse [https://github.com/new](https://github.com/new) e crie um repositório (ex: `panorama-gis`).
2. Vincule e envie os arquivos:

```powershell
git remote add origin https://github.com/SEU_USUARIO/panorama-gis.git
git branch -M main
git push -u origin main
```

### Passo 3: Conectar e Fazer Deploy na Vercel
1. Acesse [https://vercel.com](https://vercel.com) e faça login com seu GitHub.
2. Clique em **"Add New..."** > **"Project"**.
3. Importe o repositório `panorama-gis`.
4. Em **Framework Preset**, deixe como `Other`. O arquivo `vercel.json` já configurado cuidará de todo o roteamento e cabeçalhos de segurança.
5. Clique em **"Deploy"**.
6. Em ~30 segundos seu sistema estará online com certificado SSL/HTTPS gratuito (ex: `https://panorama-gis.vercel.app`).

---

## 7. Edge Functions (Proxy de Camadas Governamentais & Gestão)

### O que são?
- **`gov-proxy`:** Permite consultas espaciais WFS nos servidores do IPHAN e FUNAI sem bloqueio de CORS.
- **`manage-users`:** Permite ao dono da consultoria convidar analistas GIS (`creators`) de forma segura sem expor chaves administrativas.

### Como implantar:
```powershell
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy gov-proxy --no-verify-jwt
supabase functions deploy manage-users
```

---

## 8. Motor Espacial PostGIS (Zero Falsos Negativos & Sub-segundo)

Para ativar cruzamentos espaciais PostGIS em alta performance:
1. Acesse o **SQL Editor** do Supabase.
2. Abra o arquivo `supabase/gov_postgis_schema.sql` deste repositório e cole todo o conteúdo.
3. Clique em **"Run"**.
4. Este script ativa o PostGIS, cria as tabelas com índices espaciais **GiST** e a função RPC `analyze_project(p_geom, p_buffer_m)`.
