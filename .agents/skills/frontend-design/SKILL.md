---
name: frontend-design
description: >-
  Especialista em design de interface moderno, componentização Tailwind CSS,
  layouts responsivos, microinterações e acabamento estético premium para aplicações web e SaaS.
---

# Front-End Design & UI/UX Excellence Skill

Esta habilidade orienta a criação de interfaces ricas, funcionais e esteticamente refinadas para o PANORAMA GIS.

## Diretrizes de Construção de Interfaces

### 1. Filosofia Visual "Enterprise Dark"
- **Contraste Intencional:** Fundo quase preto `#050811`, cartões em slate escuro com transparência e desfoque (`bg-slate-900/80 backdrop-blur-md`), textos com escala clara:
  - Títulos: `text-white font-extrabold`
  - Subtítulos e instruções: `text-slate-300 font-medium`
  - Metadados e legendas secundárias: `text-slate-400 text-xs`
- **Bordas Elegantes:** Usar bordas sutis `border border-slate-800` para separar cartões sem poluir o visual.

### 2. Padrões de Componentes Reutilizáveis

#### A. Card de Métrica / KPI
```html
<div class="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 shadow-lg hover:border-slate-700 transition">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Área Total</span>
    <span class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <i data-lucide="maximize-2" class="w-4 h-4"></i>
    </span>
  </div>
  <div class="mt-2 text-xl font-bold font-mono text-white">1.450,20 ha</div>
  <div class="mt-1 text-[11px] text-emerald-400 font-medium">✓ Calculado via Turf.js</div>
</div>
```

#### B. Barra de Abas (Tabs) para Painéis e Modais
```html
<div class="flex items-center gap-2 border-b border-slate-800 pb-2">
  <button class="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 transition">
    Projetos & Fazendas
  </button>
  <button class="px-4 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition">
    Marca da Consultoria
  </button>
  <button class="px-4 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition">
    Equipe Técnica
  </button>
</div>
```

#### C. Lista de Alertas / Diagnósticos com Severidade
- **Crítico:** Fundo `bg-rose-500/10`, borda `border-rose-500/30`, texto `text-rose-300`.
- **Atenção:** Fundo `bg-amber-500/10`, borda `border-amber-500/30`, texto `text-amber-300`.
- **Conforme:** Fundo `bg-emerald-500/10`, borda `border-emerald-500/30`, texto `text-emerald-300`.

### 3. Responsividade & Layouts Fluidos
- Sempre utilizar classes responsivas (`hidden sm:flex`, `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).
- Modais com limite de altura (`max-h-[85vh]` ou `max-h-[90vh]`) e rolagem interna suave com `custom-scrollbar`.
- Evitar fixar larguras em pixels rígidos (`w-[800px]`), preferindo limites máximos flexíveis (`max-w-2xl w-full`).
