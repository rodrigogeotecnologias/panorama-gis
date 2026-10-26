---
name: gis-interaction-patterns
description: >-
  Padrões de interação humana para softwares de Geoprocessamento e SIG (WebGIS),
  focados em ferramentas de desenho, camadas, cálculo de áreas e relatórios ambientais.
---

# GIS Interaction Patterns Skill

Esta habilidade orienta a experiência de navegação e manipulação cartográfica no PANORAMA GIS.

## 1. Padrões de Navegação Cartográfica
- **Barra de Ferramentas do Mapa:**
  - Posicionamento flutuante no canto superior esquerdo ou centralizado superior do mapa.
  - Alternância de Basemaps (Satélite Esri e Topográfico OpenTopoMap) com indicação clara do mapa ativo.
  - Coordenadas do cursor em tempo real com precisão de 4 a 6 casas decimais e indicação do referencial (SIRGAS 2000).

## 2. Desenho de Geometrias e Importação de Arquivos
- **Feedback de Desenho:**
  - Quando em modo de desenho de polígono/linha, o cursor do mapa muda para mira (`crosshair`).
  - Dica visível na tela: "Clique no mapa para adicionar vértices. Dê duplo-clique para concluir o perímetro."
  - Botão de "Cancelar Desenho" sempre visível e acessível.
- **Importação de Camadas (SHP, KML, GeoJSON):**
  - Área de "Arrastar e Soltar" (Drag and Drop) com mensagem clara dos formatos suportados (.zip contendo shp/shx/dbf/prj, .kml ou .geojson).
  - Zoom automático nos limites da geometria importada (`map.fitBounds(...)`).

## 3. Matriz de Análise Espacial
- Polígono vs Polígono: Cálculo de área de intersecção em hectares e percentual de sobreposição.
- Polígono vs Linha: Cálculo de extensão linear de corte e identificação das coordenadas dos pontos de cruzamento.
- Polígono vs Ponto: Contagem e listagem com coordenadas dos pontos incidentes no perímetro ou no raio de amortecimento.
- Linha vs Polígono: Buffer de faixa e cálculo de trechos sobrepostos.
