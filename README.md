# PANORAMA GIS — Plataforma WebGIS de Inteligência Territorial

Plataforma WebGIS moderna e corporativa para análise socioambiental expedita (ASE), sobreposições geoespaciais com bases públicas oficiais (INCRA, FUNAI, IBAMA, CAR, ICMBio), gestão multi-empresa (SaaS White-Label) e geração automatizada de laudos técnicos.

---

## 📁 Estrutura de Diretórios Organizada

```text
PANORAMA_GIS/
├── assets/                               # Ativos visuais e identidades da plataforma
│   ├── branding/                         # Marcas, logotipos e manual institucional
│   │   ├── atuais/                       # ⭐ Logotipos oficiais ativos em produção
│   │   ├── ultrapassadas/                # 📦 Rascunhos, opções descartadas e backups
│   │   └── GUIA_IDENTIDADE_VISUAL.md     # Manual completo de uso e especificação cromática
│   └── images/                           # Vetores e ilustrações (ex: giscarta_globe.svg)
│
├── supabase/                             # Infraestrutura de Backend & Nuvem
│   ├── functions/                        # Edge Functions (gov-proxy, manage-users)
│   └── schema.sql                        # Modelagem PostgreSQL, RLS e funções de banco
│
├── tools/                                # Utilitários de desenvolvimento e renderização
│   ├── render_logo_card.html             # Gerador de cards para apresentações
│   ├── render_logo_horizontal.html       # Visualizador da logo horizontal corporativa
│   ├── render_logo_horizontal_transparent.html # Visualizador sem fundo
│   └── test_eval.html                    # Script de validação e testes
│
├── _backups/                             # Cópias de segurança de versões anteriores de código
│   ├── app.js.bak_proxy
│   ├── govlayers.js.bak_proxy
│   └── index.html.bak_camadas_ase
│
├── .agents/                              # Regras e habilidades para pair-programming com agentes
│   ├── rules/                            # Diretrizes de UX, Front-End e QA
│   └── skills/                           # Habilidades de design e padrões WebGIS
│
├── index.html                            # Aplicação principal (WebGIS + Landing Page + Hub da Consultoria)
├── login.html                            # Tela de autenticação corporativa
├── signup.html                           # Tela de cadastro e teste gratuito (7 dias)
├── app.js                                # Motor principal do WebGIS e lógica de negócio
├── govlayers.js                          # Módulo de camadas públicas governamentais e WFS/WMS
├── config.js                             # Configuração das chaves de conexão Supabase
├── styles.css                            # Estilização complementar e custom scrollbars
├── AGENTS.md                             # Diretrizes de engenharia e protocolo anti-bugs
├── SETUP_SUPABASE.md                     # Guia passo a passo de ativação do Supabase
└── README.md                             # Este documento de referência
```

---

## 🚀 Como Executar Localmente

Como a aplicação é um WebGIS SPA com Leaflet, Tailwind e módulos ES6, execute um servidor HTTP estático simples na pasta raiz:

### Opção 1: Com Node.js
```bash
npx serve .
# ou
npx live-server .
```

### Opção 2: Com Python 3
```bash
python -m http.server 8080
```
Em seguida, abra [http://localhost:8080](http://localhost:8080) no navegador.

---

## 🎨 Identidade Visual e Logotipos

Para consultar as diretrizes de aplicação da marca, paleta de cores hexadecimais e saber exatamente qual arquivo de logotipo usar em cada contexto, consulte o arquivo:
👉 [assets/branding/GUIA_IDENTIDADE_VISUAL.md](assets/branding/GUIA_IDENTIDADE_VISUAL.md)

---

## 🗄️ Integração com Supabase

Para ativar o banco PostgreSQL, sistema de planos e limites, controle de sessões simultâneas e login de usuários, siga o tutorial completo em:
👉 [SETUP_SUPABASE.md](SETUP_SUPABASE.md)
