# cis-barometros

Herramienta de series históricas a partir de los microdatos de los barómetros mensuales del CIS. La ventana va de enero de 2021 a octubre de 2026: **64 estudios**, todos desde el primer barómetro posterior a la etapa COVID.

**Estado:** crosswalk revisado contra cuestionarios, libros de códigos y fichas técnicas. Pipeline de armonización en R operativo: genera `datos/publicacion/microdatos.parquet` (264.081 entrevistas, 6 MB) y `metadatos.json`. La web (`web/`) se publica en GitHub Pages con cada cambio en `main`: https://gastiaso.github.io/barometros/

**Fuente de los datos:** Centro de Investigaciones Sociológicas. Se reutilizan según las condiciones generales del CIS: hay que citar la fuente, no desvirtuar el sentido de la información y no sugerir respaldo del CIS. Este proyecto no está patrocinado por el CIS ni cuenta con su respaldo.

## Estructura

```
datos/raw/MDxxxx.zip            ZIP originales del CIS (64), tal como se descargan
datos/extract/, datos/docs/     generados por los scripts (no versionar)
inventario/                     salidas (ver abajo)
scripts/00_extraer.py           ZIP -> .sav y PDF (libro de códigos, cuestionario, ficha técnica)
scripts/01_inventario.py        metadatos por estudio y por variable
scripts/02_crosswalk.py         emparejamiento concepto x estudio y detección automática de cambios
scripts/03_textos.py            PDF -> texto (cuestionario leído por columnas)
scripts/04_enunciados.py        enunciado de cada concepto en cada cuestionario y versiones
scripts/05_revision.py          crosswalk revisado + mapas de partidos, problemas y candidatos
scripts/06_revision_xlsx.py     inventario/revision.xlsx
scripts/lib/                    parsers del libro de códigos y del cuestionario
_targets.R, R/                  armonización en R: .sav -> microdatos armonizados + metadatos + validación
datos/publicacion/              microdatos.parquet y metadatos.json (generados)
scripts/07_web.R                datos de la web: una columna comprimida por pregunta (web/datos/, generado)
web/                            la web: index.html, css/, js/app.js (d3 autoalojado, sin dependencias externas)
.github/workflows/publicar.yml  construcción y publicación en GitHub Pages
```

**Reparto de lenguajes.** Python (`scripts/`) lee la documentación del CIS y produce el inventario y las tablas de revisión. R (`_targets.R`, `R/`) aplica esas tablas a los microdatos. Las decisiones de armonización viven en CSV editables (`inventario/`), no en el código.

Para reproducir hace falta Python 3 con `pyreadstat`, `pandas` y `openpyxl`, y poppler (`pdftotext`, `pdfinfo`). Los comandos se lanzan desde la raíz del proyecto:

```
python scripts/00_extraer.py .
python scripts/01_inventario.py .
python scripts/02_crosswalk.py .
python scripts/03_textos.py .
python scripts/04_enunciados.py .
python scripts/05_revision.py .
python scripts/06_revision_xlsx.py .
Rscript -e 'targets::tar_make()'
Rscript scripts/07_web.R              # VEDA=1 para la versión sin series electorales
python3 -m http.server -d web 8000    # vista previa en http://localhost:8000
```

El paso de R necesita los paquetes `targets`, `haven`, `arrow`, `dplyr`, `tidyr`, `purrr`, `readr`, `jsonlite` y `tibble`. Si la validación falla (códigos sin mapa, pesos ausentes o cifras que no reproducen las del CIS), el Parquet no se escribe.

`scripts/03_revision_xlsx.py` es de la versión anterior y se puede borrar.

## Ficheros de `inventario/`

**Revisión (lo que se usa para armonizar)**

| Fichero | Contenido |
|---|---|
| `crosswalk_revisado.csv` | Concepto × estudio (2.304 filas): variable, versión del enunciado, **nivel_final** (A/B/C/AUSENTE), `revisado` (manual / auto) y nota con la regla o el motivo |
| `decisiones_manuales.csv` | Las 31 decisiones razonadas que se imponen a la regla automática (entrada editable de `05_revision.py`) |
| `rupturas_candidatas.csv` | Registro de rupturas R01–R24, con evidencia y estado (confirmada / resuelta / descartada / nueva) |
| `enunciados.csv`, `enunciados_versiones.csv` | Enunciado de cada pregunta en cada cuestionario y sus versiones con periodo |
| `mapa_partidos.csv` | Estudio × variable × código → partido armonizado |
| `partidos_armonizados.csv` | Las 195 etiquetas de partido → 176 identificadores, con nota |
| `codigos_sin_etiqueta.csv` | Códigos de partido presentes en los datos sin etiqueta en el .sav, resueltos a mano con su fuente |
| `mapa_problemas.csv` | Estudio × código → problema armonizado (98 categorías) |
| `mapa_candidatos.csv` | Estudio × código → candidato (PREFPTE) |
| `codigos_cambio_significado_revisado.csv` | Los 89 códigos que cambian de etiqueta, verificados contra el libro de códigos o el cuestionario, con su resolución |
| `revision.xlsx` | Todo lo anterior con formato y filtros; columna `comentario` en amarillo para anotaciones |

**Validación de la armonización (generada por R)**

| Fichero | Contenido |
|---|---|
| `referencias_cis.csv` | Cifras publicadas por el CIS (avances de resultados) que el fichero armonizado debe reproducir; entrada editable |
| `validacion_cifras_cis.csv` | Cifras publicadas por el CIS frente a las calculadas con el fichero armonizado |
| `validacion_sin_mapa.csv` | Códigos presentes en los datos sin categoría armonizada (debe estar vacío) |
| `validacion_anomalias_no_respuesta.csv` | Estudios con no respuesta muy por encima de la habitual del concepto |
| `registro_etiquetas_cerradas.csv` | Variantes de etiqueta en las variables cerradas y a qué categoría se llevan |

**Inventario automático**

| Fichero | Contenido |
|---|---|
| `barometros_2021_2026.csv` | Los 64 estudios: mes, código y título |
| `estudios.csv` | Por estudio: n, variables, peso, efecto de diseño de Kish y fechas de campo |
| `variables_por_estudio.csv` | 13.691 filas estudio × variable, con etiquetas de valor |
| `conceptos.csv` | Los 36 conceptos y su regla de emparejamiento |
| `crosswalk_borrador.csv` | Emparejamiento y cambios detectados solo con los .sav (entrada de la revisión) |
| `matriz_cobertura.csv`, `lideres.csv`, `codigos_listas.csv`, `codigos_cambio_significado.csv`, `partidos_etiquetas.csv` | Tablas auxiliares del inventario |

## Niveles

- **A**: comparable tal cual. Puede cambiar el nombre de la variable o el texto de las etiquetas.
- **B**: comparable con una regla de armonización documentada (redacción, códigos de no respuesta, códigos reutilizados en listas abiertas, contexto electoral).
- **C**: no comparable. Cambian las categorías, la definición o el contexto de la pregunta.
- **AUSENTE**: el concepto no está en el estudio (confirmado o derivable).

Resultado de la revisión: **2.173 A, 115 B, 10 C y 6 AUSENTE**.

Cómo se ha revisado:

- 31 filas por decisión manual.
- 1.368 con la regla automática comprobada contra el enunciado del cuestionario y el .sav.
- 905 solo con el .sav: conceptos sin pregunta propia (variables derivadas, muestrales o técnicas) o con enunciado no extraído.

## Rupturas (C)

| Ruptura | Mes | Qué cambia | Afecta a |
|---|---|---|---|
| R23 | 2021-07 | Práctica religiosa: escala de 5 a 6 categorías | practica_religiosa |
| R04 | 2022-05 | Participación: de 7 a 4 opciones | participacion_g |
| R09 | 2023-10 | Recuerdo y participación pasan a referirse a las generales de 2023 | recuerdo, participacion_g |
| R19 | 2023-10 | Bloque de intención de voto: nuevo enunciado, precedido de la probabilidad de votar | intención (directa y recodificada), voto + simpatía; B en simpatía e intención alternativa |
| R10 | 2023-11 | Ponderación con ajuste por nivel educativo (deff 1,1 → ~2) | todas las series |
| R20 | 2024-01 | Nivel de estudios: de «cursados» a «terminados con titulación» | nivel_estudios, estudios y la propia ponderación |

R19 y R22 coinciden con una reordenación del cuestionario en octubre de 2023, seguida un mes después por el cambio de ponderación (R10). **Para las series electorales, octubre-noviembre de 2023 es el corte principal de la ventana.** Decisión sobre R19: la serie se muestra continua, con una marca visual en octubre de 2023, y no se calculan variaciones entre meses situados a ambos lados del corte.

## Hallazgos que condicionan el diseño

1. **Los códigos de partido no son estables.**
   - En octubre de 2022 (3380) el CIS renumera toda la lista. Antes era PP=1, PSOE=2 y VOX=18; después, PSOE=1, PP=2 y VOX=3. Está confirmado en los cuestionarios.
   - También se reutilizan códigos de candidato y de problema.
   - La armonización se hace por etiqueta con los `mapa_*.csv`. No se fusionan marcas distintas: UP, Sumar, Podemos, Podemos-IU-AV, Más País… aparecen en los meses en que el CIS las ofrece.
   - Solo se unifican variantes de la misma opción, documentadas en la nota: JxCat/Junts, Sumar/Movimiento Sumar en el mismo código, la errata «Compromiso por País Vasco» y las variantes de CC.
2. **Ponderación (R10).**
   - Desde noviembre de 2023 la muestra efectiva baja de ~3.500 a ~2.000 y el margen al 50 % pasa de ±1,6 a ±2,2 pp.
   - La muestra sin ponderar tiene ≈47-50 % de personas con estudios superiores. Eso explica que el ajuste por nivel educativo duplique el efecto de diseño.
   - Las fichas técnicas no detallan el ajuste. Remiten a la FAQ «Muestra y ponderación» del CIS, que incluye el nivel educativo entre las variables.
3. **La no respuesta está declarada como *user-missing* en los .sav.** Hay que leer con `haven::read_sav(user_na = TRUE)` o `pyreadstat.read_sav(..., user_missing=True)`. Si no, NS y NC se pierden como NA.
4. **Los códigos de no respuesta varían entre estudios.**
   - Partidos: 98/99 → 998/999 → 9998/9999.
   - Problemas: 98/99 → 998/999.
   - EDAD: 99 o 999 según el estudio, y en 3489 hay una persona real de 99 años.

   Los códigos de no respuesta se toman siempre del propio estudio.
5. **Líderes.** Se emparejan por nombre, no por posición. «No conoce» es unas veces el código 97 y otras un filtro previo (R14).
6. **No existen** las series de situación política ni de situación económica prospectiva: ninguno de los 64 cuestionarios las incluye. La situación económica general y personal falta en marzo de 2022 (R03).
7. **Barómetros atípicos.**
   - 3410 y 3420 son postelectorales, con n de 7.407 y 10.101. En 3410, 3413 y 3420 la intención de voto usa enunciados electorales específicos (B).
   - 3489 incluye una sobremuestra de 1.000 entrevistas en la Comunitat Valenciana. Eso explica su deff, sin que haya cambio de método (R11, descartada).
8. **Errores en los ficheros del CIS, corregidos en el pipeline.**
   - 3582 (oct-2026): `ESTUDIOS` viene vacía (5.010 de 5.024 casos como N.C.). Se reconstruye desde `NIVELESTENTREV` con la correspondencia de 3571 y 3577; la distribución resultante coincide con la de 3577 a menos de 0,5 pp. La ponderación no está afectada: `ESCIDEOL` reproduce la cifra publicada.
   - 3502: el código 0 de `INTENCIONGALTER` (1.205 casos filtrados) está etiquetado «N.C.»; se trata como «No procede».
   - Códigos de partido sin etiqueta en 3457 y 3502: se resuelven en `codigos_sin_etiqueta.csv`.
9. **No respuesta armonizada por tipo, no por código:** NS (no sabe, «no sabe todavía»), NC (no contesta), NR (no recuerda) y NP (no procede: el entrevistado no recibió la pregunta). NP queda fuera de la base de los porcentajes; NS, NC y NR cuentan en ella, como en las publicaciones del CIS.

## Web

- **Cálculo en el navegador.** Cada vista descarga solo las columnas que necesita (unos cientos de KB) y agrega los microdatos con la ponderación del estudio. No hay servidor.
- **Paneles configurables.** Siete tipos de gráfico: evolución mensual (líneas, con media móvil de 3 barómetros opcional), un barómetro (barras apiladas al 100 % por grupo), comparación de dos barómetros (con significación), mapa de calor meses × respuestas, transferencias de voto (recuerdo → respuesta actual), dispersión de grupos (dos indicadores, cada punto un electorado o un grupo de perfil) y mapa por comunidades. Cruce por una variable de perfil, filtro por otra, periodo, exclusión de NS/NC de la base y margen de error. Hasta 12 respuestas o grupos por panel. Tabla, CSV y PNG por panel; enlace compartible con la configuración.
- **Reponderación por recuerdo de voto (opcional, desactivada por defecto).** `R/recuerdo.R` añade `peso_recuerdo`: los pesos del CIS ajustados para que el recuerdo de quienes podían votar reproduzca la participación de los residentes y el reparto entre los partidos principales y el resto en las generales de referencia (10N 2019 hasta sep-2023; 23J 2023 desde oct-2023). Datos en `inventario/resultados_electorales.csv`; efecto de diseño resultante en `inventario/deff_recuerdo.csv` (1,3 a 3,2). Es una estimación propia: no reproduce las tablas del CIS y hereda la deriva del recuerdo.
- **Acumulación de barómetros.** Transferencias, dispersión y mapa suman varios barómetros consecutivos para ganar muestra, sin cruzar rupturas C.
- **Líderes y ministros.** La valoración de líderes (batería VALORALIDERES) y la de ministros (VALMINIS, trimestral) se emparejan por nombre. Gabriel Rufián no figura en ninguna de las dos baterías: solo aparece en la preferencia como presidente (desde feb-2025). Irene Montero se valora como ministra entre jul-2021 y oct-2023 y aparece en la preferencia como presidente desde dic-2022.
- **Reglas fijas:** no se muestra ningún punto con menos de 50 entrevistas sin ponderar; margen de error al 95 % con el efecto de diseño de cada estudio; rupturas C marcadas en color y B en punteado; no se calcula la variación mensual a través de una ruptura C (decisión sobre R19).
- **Veda (art. 69.7 LOREG).** Sin retirada automática. El flujo de publicación conserva un interruptor manual (Actions > Publicar > Run workflow > «Forzar el modo veda») que publica la web sin las series electorales ni la descarga del fichero completo.

## Pendiente

- R24 (cambio de la población de referencia de la ponderación, mar-2025): sin verificar en los datos.
- Ampliar `referencias_cis.csv` a 2021–2022 y a oct-2026 (hoy cubre oct-2023, mar-2025 y mar-2026, más la serie de ideología).
- Si el CIS corrige el fichero de 3582, retirar la reconstrucción de `ESTUDIOS`.
- Las 76 comprobaciones de códigos sin lista en el libro de códigos se apoyan solo en el .sav.

Las conclusiones son provisionales. Se derivan de la documentación del CIS y de comprobaciones puntuales en los datos, no de una evaluación del efecto de cada cambio sobre las series.
