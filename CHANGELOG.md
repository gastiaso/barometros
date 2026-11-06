# Cambios

Registro de los cambios que afectan a los datos publicados (Parquet, columnas de la web), al método o a lo que ve quien usa la web. Los arreglos menores quedan en el historial de git. Fechas en formato AAAA-MM-DD; el último barómetro incorporado figura entre paréntesis.

## Sin publicar

- Fuentes de `inventario/resultados_electorales.csv` contrastadas con los resúmenes de la Junta Electoral Central en el BOE (BOE-A-2019-17344 y su corrección BOE-A-2019-18147; BOE-A-2023-18907). Las cifras no cambian; cambia la cita. Las del voto CERA siguen procediendo de las actas de las juntas provinciales recopiladas por España Exterior.
- Nota metodológica: se documenta que la participación objetivo de la reponderación excluye el CERA y el reparto entre partidos lo incluye (menos del 1 % de los votantes); se añade un apartado de abreviaturas.
- README: la validación se describe con su cobertura real (185 cifras en 8 de 64 barómetros, de 1 a 55 por barómetro) y el margen de error como «más realista que el de la ficha técnica», no como «honesto»: incorpora el efecto de diseño de la ponderación, no el del muestreo por conglomerados.
- Web: la serie reponderada por recuerdo deja de ser el segundo panel por defecto y pasa al final del bloque electoral; la imagen de vista previa para redes, que captura la primera fila de paneles, deja de incluirla.
- Web: los gráficos de barras van agrupados por defecto; se apilan al 100 % solo con cruce y cinco o más respuestas marcadas (o si se fuerza en el editor, nueva opción «Disposición»). El panel de intención de voto por edad de la configuración por defecto sigue apilado.
- Web: la nube «Cada punto, una entrevista» lleva dentro del lienzo el rótulo «Sin ponderar · muestra igualada por mes · no es una estimación», también en el PNG y el banner.
- Web: la línea de metadatos y el editor explican que en la media móvil cada punto resume ese barómetro y los dos anteriores; «s. d.» pasa a «sin dato» en el detalle de las líneas; «Comparar» explica «s. c.» cuando no hay comparación posible.
- `requirements.txt` con las dependencias de Python; `scripts/03_revision_xlsx.py` (sustituido por `06_revision_xlsx.py`) eliminado.

## 2026-11-04 (barómetro de octubre de 2026, estudio 3582)

- Nueva vista «Cada punto, una entrevista»: nube de entrevistas sin ponderar en canvas, en la portada y en el explorador.
- CI construye en `ubuntu-24.04`.

## 2026-10-24

- Reponderación por recuerdo: la participación se ajusta sobre todos los que podían votar (antes, solo entre quienes recordaban el voto). Cambia la columna `peso_recuerdo` y `inventario/deff_recuerdo.csv`.
- Veda electoral solo manual (variable `VEDA=1` al generar los datos de la web); se retira la activación automática por fecha.
- Mejoras de rendimiento, accesibilidad, navegación y exportación de la web.

## 2026-10-23

- Intención directa de voto por defecto con la recodificación del CIS (INTENCIONGR); la respuesta literal (INTENCIONG) queda como pregunta aparte.
- Reponderación por recuerdo con raking a sexo, edad y nivel de estudios además del recuerdo.
- Media móvil y acumulación solo con los meses que tienen la respuesta.
- Nuevas rupturas documentadas: preferencia como presidente, ocupación, ingresos y agrupaciones del CIS.
- Partidos: un identificador por opción; líderes y ministros de enero y abril de 2021; las variables AUSENTE no se leen.

## 2026-10-22

- Página de entrada «¿Qué es esto?» y aviso «No es la estimación de voto del CIS» en las series de voto.
- Prueba en Chromium (`scripts/08_prueba_web.py`): la web recalcula las referencias del CIS y debe dar lo mismo que R; las pull requests construyen y prueban la web sin publicarla.
- Resumen «Qué cambia en el último barómetro», bloques de respuestas, nuevos cruces y versión móvil.
- Nuevo nombre, «Barómetro a barómetro»; licencias MIT (código) y CC BY 4.0 (datos); CITATION.cff; metadatos para buscadores y redes.

## 2026-10-21

- Primera publicación: pipeline de armonización en R (microdatos en Parquet, metadatos y validación contra cifras del CIS), inventario y revisión en Python, web en GitHub Pages con series, barras, transferencias, dispersión, mapa, mapa de calor, comparación de barómetros y media móvil.
- Microdatos originales del CIS de los 64 barómetros de enero de 2021 a octubre de 2026.
