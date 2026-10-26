# Protocolo de Garantia de Qualidade (QA) e Auto-Verificação

Para poupar o tempo do usuário e evitar retrabalho de bugs óbvios, antes de concluir qualquer alteração de código ou interface, o assistente deve cumprir este checklist mental e automatizado:

## Checklist Obrigatório Pré-Entrega

1. **Checagem de Sintaxe e Execução Limpa:**
   - Conferir se não há parênteses, chaves ou aspas abertas sem fechar.
   - Nenhuma linha de código deve quebrar o script com exceção não tratada.

2. **Checagem de Identificadores Cruzados (HTML ↔ JS):**
   - Todos os IDs referenciados em `app.js` via `$('...')` existem em `index.html` ou estão protegidos com verificação condicional/optional chaining.
   - Nenhuma operação como `.textContent =`, `.classList.add/remove/toggle` ou `.addEventListener` pode rodar em um seletor nulo.

3. **Ciclo Completo de Ações do Usuário:**
   - **Fluxo de Abrir e Fechar:** Se abrir uma modal, ela deve ter como fechar (no 'x' e no fundo).
   - **Fluxo de Salvar:** Ao clicar em salvar, a alteração deve refletir na hora na tela sem depender de F5.
   - **Fluxo de Navegação:** Botões de teste e exploração devem levar diretamente à tela do mapa redimensionando-o corretamente com `map.invalidateSize()`.

4. **Sem Espaços Vazios ou Conteúdo Quebrado:**
   - Imagens devem possuir `alt` e fallback se falharem ao carregar.
   - Textos longos devem ter quebra adequada (`truncate` ou `break-words`).
   - Telas e modais com tabelas devem ter rolagem horizontal e vertical suave (`overflow-x-auto`, `overflow-y-auto`).
