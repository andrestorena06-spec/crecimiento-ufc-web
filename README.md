# Crecimiento y UFC – curva de absorbancia + recuento de colonias (versión web)

Aplicación web que junta, en un mismo lugar, la **curva de crecimiento por densidad óptica (OD)** de una placa de
96 pocillos y el **recuento de UFC por gota** (diluciones seriadas sembradas en agar), para ver las dos mediciones
de cada muestra sobre el mismo gráfico.

**Todo se calcula en tu navegador.** Los archivos y los resultados no se envían a ningún servidor.

## Usar sin internet

[**Crecimiento_UFC.html**](Crecimiento_UFC.html) (≈ 500 KB): un solo archivo; se descarga y se abre con doble clic en Edge,
Chrome o Firefox. No requiere instalar nada.

## Qué hace
- **Varios experimentos a la vez** (barra de pestañas arrastrables, con doble clic para renombrar). Cada experimento
  tiene su curva de OD y su recuento de UFC. También se puede crear un experimento solo con UFC.
- **Planillas de Excel o LibreOffice** (.xlsx, .xls, .xlsm, .xlsb, .ods). Lee las curvas del lector («Time [s]» con pocillos A1..H12, columna de
  tiempo con los pocillos como encabezados, o bloques «T=0, T=1…» con la matriz A..H de cada tiempo).
- **Curvas de crecimiento (OD)**: configuración de pocillos por arrastre, preprocesado y control de calidad (blanco,
  Hampel, OD máxima, suavizado, normalización), gráficos, μmax, tiempo de duplicación, lag, K, AUC, fases, mapa de
  placa y modelos (Gompertz, logístico, Richards, Baranyi-Roberts).
- **Recuento de UFC**: define el volumen de la gota (20 µL), el factor de dilución entre columnas y el rango contable
  (3 a 30 colonias); asigna muestras a la placa de diluciones (cada fila es una réplica); carga las colonias de cada
  gota hora por hora (se puede pegar desde Excel) y calcula UFC/mL = colonias ÷ volumen × factor^columna.
  Importa y exporta la planilla de Excel con bloques «T=0 … T=6».
- **Comparar**: OD (líneas, eje izquierdo) y UFC (cuadrados con barra de error, eje derecho) juntas, por experimento o
  promediando experimentos; μ según UFC contra μ según OD; relación entre la OD y el log10 de las UFC.
- **Sesión** que guarda todos los datos de los Excel y los conteos; al abrir la página pregunta si continuar con el
  trabajo anterior. «Guardar como» para elegir carpeta (Edge y Chrome).
- Tablas con filtros por columna, columnas movibles y descarga a Excel; análisis completo en un Excel.
- Pestaña *Métodos* con todos los cálculos explicados paso a paso.

## Estructura
- `docs/` – sitio ya compilado (es lo que publica GitHub Pages).
- `web/` – código fuente (React + Vite). Para recompilar:

```bash
cd web
npm install
npm run build:web      # genera web/dist-web (copiar su contenido a docs/)
npm run build:single   # genera web/dist-single/index.html (un solo archivo)
```

- `icono/` – ícono (una curva de crecimiento con colonias): `.svg`, `.ico` y PNG.
