# Padrões de Design e Interface Front-End (PANORAMA GIS)

## Heurísticas de Usabilidade
1. **Visibilidade do Estado do Sistema:**
   - O usuário sempre sabe qual projeto está ativo, quantas camadas estão carregadas e qual o status da conexão.
   - Qualquer processamento geográfico exibe indicador em tempo real com estimativa ou mensagem descritiva clara.

2. **Correspondência com o Mundo Real (GIS Ambiental & Fundiário):**
   - Usar termos da rotina do consultor: "Sobreposição", "Área de Preservação Permanente (APP)", "Reserva Legal (RL)", "Faixa de Domínio", "Amortecimento de Cavidades", "SIRGAS 2000", "Coordenadas Decimais".
   - Evitar jargões de programação na tela (ex: nunca exibir `object Object`, `null`, `undefined` ou `NaN ha`).

3. **Prevenção e Tratamento Gracioso de Erros:**
   - Se uma camada WMS oficial (ex.: servidor do INCRA ou FUNAI) estiver instável, a interface não trava: exibe um badge âmbar com a mensagem "Órgão temporariamente instável na consulta — tentar novamente mais tarde".
   - Validações antes de submeter formulários: verificar formato de e-mail, coordenadas dentro do Brasil (-34 a 5 lat, -74 a -34 lon).

4. **Componentização Visual Consistente:**
   - Botões de Ação Principal: `bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/40`.
   - Botões Secundários: `bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl`.
   - Badges de Status: `rounded-full px-2.5 py-0.5 text-[11px] font-bold border`.
   - Tabelas: Cabeçalho fixo com `bg-slate-800/90 text-slate-300`, linhas zebradas sutis e hover destacado `hover:bg-slate-800/40`.
