# PANORAMA GIS — Guia de Identidade Visual e Organização de Logotipos

Este documento detalha o padrão de identidade visual oficial do **PANORAMA GIS** e documenta a separação rigorosa entre as marcas ativas de produção, os arquivos legados/arquivados e o laboratório de testes.

---

## 1. Cores Institucionais e Padrão Cromático Oficial

| Aplicação | Cor Hex | Tailwind Class | Descrição |
| :--- | :--- | :--- | :--- |
| **Acento Primário (Verde Iluminado da Logo)** | `#2E9860` | `text-[#2E9860]` / `bg-emerald-500` / `text-emerald-400` | **Cor oficial da Logo e do "GIS"**, botões de ação e aprovação executiva (extraída do domo 3D) |
| **Fundo Corporativo (GISCARTA Blue)** | `#234066` / `#243f64` | `bg-[#234066]` | Fundo nobre utilizado na barra superior, modais e cards da landing page |
| **Plano de Fundo do Produto ASE** | `#5A6675` | `bg-[#5A6675]` | Fundo da top-bar operacional, painéis laterais de diagnóstico/camadas, modais e controles do mapa |
| **Fundo Profundo (Dark Slate)** | `#050811` / `#0a0f1d` | `bg-slate-950` | Base do sistema cartográfico e canvas WebGIS |
| **Acento Secundário (Teal/Turquesa)** | `#14b8a6` / `#2dd4bf` | `text-teal-400` | Camadas ativas, seleções e destaques de dados |
| **Alerta / Amortecimento (Âmbar)** | `#f59e0b` / `#fbbf24` | `text-amber-400` | Zonas de amortecimento, atenção e proximidade |
| **Restrição Crítica (Rose/Vermelho)** | `#f43f5e` / `#ef4444` | `text-rose-500` | Embargos IBAMA, terras indígenas e sobreposição restritiva |

---

## 2. Logotipos Oficiais Atuais em Produção (`assets/branding/atuais/`)

Estes são os arquivos **oficiais e ativos em todo o sistema**, correspondendo ao **Globo Minimalista 3D com Abaulamento Frontal** em Ultra HD (1024×1024 px) na cor **Verde Oficial (#0B8343)** e **Azul Tech (#0087D1)** com efeito **Puro Cristalino (sem filtros ou sombras artificiais)**:

| Arquivo | Formato | Fundo | Onde Usar |
| :--- | :--- | :--- | :--- |
| **`Panorama_GIS_Emblema_Transparente.png`** | PNG Transparente (1024 × 1024 px) | Transparente | **Emblema principal oficial**. Utilizado no Navbar, Favicon, Modais de Autenticação (Login/Cadastro), Barra Superior do Mapa ASE e Marca D'água. |
| **`Panorama_GIS_Logo_Completa_Transparente.png`** | PNG Transparente (1600 × 460 px) | Transparente | **Logo completa horizontal**. Emblema 3D + tipografia oficial "PANORAMA GIS" + subtítulo *"PLATAFORMA GEOESPACIAL INTELIGENTE"*. |
| **`Panorama_GIS_Logo_Completa_Fundo_Azul.png`** | PNG (1600 × 460 px) | `#234066` | **Logo completa com fundo corporativo**. Ideal para headers fixos, apresentações e capas de documentos. |
| **`Panorama_GIS_Horizontal_Transparente.png`** | PNG Transparente (1600 × 460 px) | Transparente | **Versão master horizontal de alta resolução**. Ideal para cabeçalhos de laudos ASE e exportações para impressão. |
| **`Panorama_GIS_Logo_Apresentacao_WhatsApp.png`** | PNG (1200 × 630 px) | Dark Slate Nobre | **Card social / OpenGraph**. Otimizado para compartilhamento em WhatsApp, LinkedIn e prévias de links com o novo emblema 3D. |
| **`Panorama_GIS_Emblema.svg` / `Panorama_GIS_Logo_3D.svg`** | SVG Vetorial Puro | Transparente | **Vetor SVG nativo com iluminação 3D**. Para renderizações com escalonamento infinito. |
| **`Panorama_GIS_Logo_2D_HD.svg`** | SVG Vetorial 2D | Transparente | **Vetor SVG nativo 2D Ultra HD**. Curvas Bézier limpas sem gradientes. |

---

## 3. Logotipos Ultrapassados e Histórico (`assets/branding/ultrapassadas/`)

Estes arquivos correspondem a etapas anteriores de design e versões conceituais descontinuadas. Estão preservados estritamente para auditoria e histórico:

### A. Geração Olho Neural V5 (`ultrapassadas/geracao_olho_neural_v5/`)
Preserva todos os arquivos de produção da identidade visual anterior baseada na proposta do Gemini:
* `Panorama_GIS_Emblema_Transparente.png`
* `Panorama_GIS_Logo_Completa_Transparente.png`
* `Panorama_GIS_Logo_Completa_Fundo_Azul.png`
* `Panorama_GIS_Horizontal_Transparente.png`
* `Panorama_GIS_Logo_Apresentacao_WhatsApp.png`
* `Panorama_GIS_Olho_Neural_Master_Original.jfif`

### B. Geração Globo Verde Legado (`ultrapassadas/geracao_globo_verde_legado/`)
Preserva todos os arquivos de produção da identidade visual da primeira versão do software (globo com anel orbital e satélite).

---

## 4. Laboratório Experimental de Logos (`tools/teste_logo_moderna.html`)

Ambiente de teste e prototipação interativa onde as variações foram comparadas antes da aprovação final:
* **Globo Minimalista 3D Abaulada**: Versão aprovada e implantada em produção.
* **Globo Minimalista 2D HD**: Versão vetorial pura complementar.
* Variações de cor e testes preliminares arquivados.

### Simulador Interativo:
👉 **[`tools/teste_logo_moderna.html`](../../tools/teste_logo_moderna.html)**
