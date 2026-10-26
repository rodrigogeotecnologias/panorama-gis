# PANORAMA GIS — Diretrizes de Engenharia de Front-End, UX e QA Proativo

Este documento rege a atuação técnica, arquitetura de interface e garantia de qualidade (QA) para o desenvolvimento do PANORAMA GIS.

---

## 1. Princípios de Experiência do Usuário (UX) & Dualidade de Público

O PANORAMA GIS atende simultaneamente a dois perfis exigentes:
1. **O Dono de Empresa / Decisor Executivo (Leigo em GIS):**
   - Não quer lidar com menus obscuros de geoprocessamento tradicional (QGIS/ArcGIS).
   - Precisa de respostas diretas: "A fazenda tem problema ambiental sim ou não?", "Qual a área?", "Cadê o laudo pronto para enviar ao cliente?".
   - Exige interface limpa, elegante, com cores claras de alerta (Verde = Liberado, Amarelo = Atenção/Proximidade, Vermelho = Restrição Crítica).
2. **O Consultor & Analista Técnico Sênior (Experiente em GIS):**
   - Precisa de agilidade extrema e precisão matemática.
   - Demanda coordenadas exatas (SIRGAS 2000, Lat/Lon com precisão decimal), métricas em hectares, perimetro em km, buffers e cruzamentos confiáveis.
   - Não tolera inconsistências de cálculo ou termos imprecisos.

---

## 2. Protocolo Anti-Bugs Óbvios (Garantia de Qualidade Proativa)

Antes de entregar qualquer código ou modificação ao usuário, o assistente **DEVE** auto-verificar:

### A. Integridade de Elementos DOM e Eventos
- **Regra de Ouro:** NUNCA acessar `$('elemento').propriedade` diretamente se houver qualquer chance de o elemento ter sido movido, renomeado ou removido. Sempre usar `$('elemento')?.propriedade` ou guarda explícita `if ($('elemento'))`.
- **Bidirecionalidade:** Todo botão adicionado no HTML DEVE ter um ouvinte correspondente em JS ou `onclick` de fallback inline. Nenhum botão pode ser "morto" ou inerte.
- **Limpeza de Refatoração:** Se um botão ou campo for movido de lugar (ex.: do cabeçalho para dentro de uma modal), verificar todas as ocorrências no JS e garantir que nenhuma linha lance `TypeError`.

### B. Usabilidade de Modais e Navegação
- Toda modal DEVE:
  1. Ter botão visível de fechar (`btn-close-*` ou ícone `x`).
  2. Ter rolagem interna automática em telas menores (`max-h-[90vh] overflow-y-auto custom-scrollbar`).
  3. Fechar também ao clicar no backdrop ou pressionar a tecla `Escape`.
- Formulários e configurações (ex.: Marca da Consultoria):
  - Devem persistir imediatamente (seja no `localStorage` no modo local/sandbox ou no Supabase).
  - Devem atualizar o cabeçalho e a prévia na hora sem exigir que o usuário dê F5 na página.
  - Devem exibir feedback de sucesso imediato (`showToast(...)`).

### C. Feedback Visual Imediato (<100ms)
- O usuário NUNCA deve clicar e ficar na dúvida se o sistema registrou a ação.
- Estados de carregamento com pulsos esmeralda (`animate-pulse`), textos descritivos ("Consultando INCRA/FUNAI...") e toasts elegantes de confirmação.

---

## 3. Padrão Visual & Design System (Tailwind CSS)

- **Fundo Base:** Dark Slate profundo `#050811` com cartões em `bg-slate-900/90` e bordas em `border-slate-800/80`.
- **Acentos de Marca:**
  - Primário: Verde Oficial PANORAMA (`#21B66F` / `emerald-500` com destaques luminosos em `emerald-400` / `#21C46B`) extraído do domo iluminado da logo 3D para máximo contraste no tema escuro.
  - Secundário: Turquesa/Teal (`teal-400`) para dados de clientes e camadas ativas.
  - Alerta: Âmbar (`amber-400`) para amortecimentos e proximidades.
  - Perigo: Rosa/Vermelho (`rose-500`) para embargos, terras indígenas e sobreposições críticas.
- **Tipografia Estruturada:**
  - `font-sans` (`Plus Jakarta Sans`) para toda a navegação, títulos, textos explicativos e laudos.
  - `font-mono` (`JetBrains Mono`) para números técnicos, coordenadas geográficas, códigos CAR e áreas (ha).
- **Interatividade:**
  - Todos os botões e cartões clicáveis devem ter `cursor-pointer`, transição suave `transition-all duration-150` e efeito tátil (`active:scale-[0.98]`).
