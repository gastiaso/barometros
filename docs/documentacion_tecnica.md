# Documentación técnica

Detalle del inventario, la revisión y la armonización de los barómetros del CIS que alimentan [Barómetro a barómetro](https://gastiaso.github.io/barometros/). Para una visión general, ver el [README](../README.md).

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
tests/                          pruebas unitarias de R/ (testthat; Rscript tests/testthat.R)
datos/publicacion/              microdatos.parquet y metadatos.json (generados)
scripts/07_web.R                datos de la web: una columna comprimida por pregunta (web/datos/, generado)
scripts/08_prueba_web.py        prueba en Chromium: la web recalcula las referencias del CIS y debe dar lo mismo que R
scripts/07_estimacion.R         datos de «Construye tu estimación» (web/datos/estimacion.json) desde la rejilla ya calculada
scripts/09_vista_previa.py      imagen para redes (web/img/vista-previa.png): captura de los paneles por defecto
estimacion/                     estimación de voto: rejilla de supuestos (rejilla.R), modelos de referencia con remuestreo
                                (modelos.R), estimación publicada por el CIS (estimacion_cis.csv) y resumen (resumen_rejilla.py)
web/                            la web: index.html, css/, js/app.js, js/vistas.js, js/guia.js, js/estimacion.js (d3 autoalojado, sin dependencias externas)
.github/workflows/publicar.yml  construcción y publicación en GitHub Pages
```

**Reparto de lenguajes.** Python (`scripts/`) lee la documentación del CIS y produce el inventario y las tablas de revisión. R (`_targets.R`, `R/`) aplica esas tablas a los microdatos. Las decisiones de armonización viven en CSV editables (`inventario/`), no en el código.

Para reproducir hace falta Python 3 con los paquetes de `requirements.txt` (`pip install -r requirements.txt`; `pandas` solo lo usa `06_revision_xlsx.py`) y poppler (`pdftotext`, `pdfinfo`). Los comandos se lanzan desde la raíz del proyecto:

```
python scripts/00_extraer.py .
python scripts/01_inventario.py .
python scripts/02_crosswalk.py .
python scripts/03_textos.py .
python scripts/04_enunciados.py .
python scripts/05_revision.py .
python scripts/06_revision_xlsx.py .
Rscript -e 'targets::tar_make()'
Rscript estimacion/rejilla.R          # rejilla de la estimación (cerca de una hora; solo cuando hay barómetro nuevo)
Rscript scripts/07_web.R              # VEDA=1 para la versión sin series electorales
Rscript scripts/07_estimacion.R       # datos de «Construye tu estimación» (nada en modo veda)
python scripts/08_prueba_web.py .     # la web calcula igual que R y que el CIS (Playwright + Chromium)
python scripts/09_vista_previa.py .   # imagen de vista previa para redes
npm ci && npm run lint                # comprobación estática de web/js (eslint; también en CI)
python3 -m http.server -d web 8000    # vista previa en http://localhost:8000
```

El paso de R necesita los paquetes `targets`, `haven`, `arrow`, `dplyr`, `tidyr`, `purrr`, `readr`, `jsonlite` y `tibble` (y `nnet` para la estimación; `testthat` para las pruebas). Si la validación falla (códigos sin mapa, pesos ausentes o cifras que no reproducen las del CIS), el Parquet no se escribe.

**Versiones.** La construcción en GitHub (`.github/workflows/publicar.yml`) fija la versión de R (4.6.2) y toma los paquetes de una instantánea por fecha de Posit Package Manager (`packagemanager.posit.co/cran/__linux__/noble/AAAA-MM-DD`), así que dos construcciones con el mismo código dan el mismo resultado hasta que se adelante la fecha a mano. Para reproducir ese entorno en local, la misma dirección sirve como repositorio: `options(repos = c(CRAN = "https://packagemanager.posit.co/cran/AAAA-MM-DD"))` antes de `install.packages()`. Si se prefiere un fichero de bloqueo, `renv::init(bare = TRUE); renv::snapshot(type = "explicit")` desde la raíz genera `renv.lock` con las versiones instaladas en el entorno propio (hoy no se versiona ninguno). Las versiones comprobadas del flujo de Python están en `requirements.txt`.

**Pruebas unitarias.** `Rscript tests/testthat.R` comprueba las funciones de armonización que no dependen de los .sav: tipos de no respuesta, agrupación de ocupación e ideología, celdas del recuerdo, objetivos electorales y el raking (márgenes, conservación de sexo/edad/estudios, cota del factor de ajuste). Se ejecutan en CI antes de la armonización.

## Ficheros de `inventario/`

**Revisión (lo que se usa para armonizar)**

| Fichero | Contenido |
|---|---|
| `crosswalk_revisado.csv` | Concepto × estudio (2.560 filas): variable, versión del enunciado, **nivel_final** (A/B/C/AUSENTE), `revisado` (manual / auto), nota con la regla o el motivo y `nota_publica`, la que se muestra en la web |
| `decisiones_manuales.csv` | Las decisiones razonadas que se imponen a la regla automática (67: 46 anteriores y 21 del tramo R30 de los problemas personales) (entrada editable de `05_revision.py`) |
| `rupturas_candidatas.csv` | Registro de rupturas R01–R30, con evidencia, estado (confirmada / resuelta / descartada / nueva) y `etiqueta_corta` (la que rotula la guía) |
| `eventos_electorales.csv` | Convocatorias electorales (generales, europeas, autonómicas, municipales) que la web puede marcar en el eje de las series; solo convocatorias |
| `enunciados.csv`, `enunciados_versiones.csv` | Enunciado de cada pregunta en cada cuestionario y sus versiones con periodo |
| `enunciados_adicionales.csv` | Enunciados para las fichas de la web que no salen de la extracción automática (intención recodificada, voto + simpatía, líderes y ministros) |
| `mapa_partidos.csv` | Estudio × variable × código → partido armonizado |
| `partidos_armonizados.csv` | Las 195 etiquetas de partido → 165 identificadores, con nota |
| `codigos_sin_etiqueta.csv` | Códigos de partido sin etiqueta (o con una etiqueta ambigua) en el .sav, resueltos a mano con su fuente; prevalecen sobre el mapa automático |
| `mapa_problemas.csv` | Estudio × código → problema armonizado (99 identificadores, incluida la no respuesta) |
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
| `deff_recuerdo.csv` | Por estudio, efecto de diseño de los pesos reponderados por recuerdo, factores de ajuste extremos, iteraciones del raking, % de entrevistas recortadas por la cota y desvío máximo de los márgenes |
| `menciones_problemas.csv` | Por estudio y bloque de problemas (España, personales): menciones sustantivas medias por persona y % con tres y con ninguna, ponderado (diagnóstico de R30) |

**Inventario automático**

| Fichero | Contenido |
|---|---|
| `barometros_2021_2026.csv` | Los 64 estudios: mes, código y título |
| `estudios.csv` | Por estudio: n, variables, peso, efecto de diseño de Kish y fechas de campo |
| `variables_por_estudio.csv` | 13.691 filas estudio × variable, con etiquetas de valor |
| `conceptos.csv` | Los 40 conceptos y su regla de emparejamiento |
| `crosswalk_borrador.csv` | Emparejamiento y cambios detectados solo con los .sav (entrada de la revisión) |
| `matriz_cobertura.csv`, `lideres.csv`, `codigos_listas.csv`, `codigos_cambio_significado.csv`, `partidos_etiquetas.csv` | Tablas auxiliares del inventario |

## Niveles

- **A**: comparable tal cual. Puede cambiar el nombre de la variable o el texto de las etiquetas.
- **B**: comparable con una regla de armonización documentada (redacción, códigos de no respuesta, códigos reutilizados en listas abiertas, contexto electoral).
- **C**: no comparable. Cambian las categorías, la definición o el contexto de la pregunta.
- **AUSENTE**: el concepto no está en el estudio (confirmado o derivable).

Resultado de la revisión: **2.357 A, 115 B, 13 C y 75 AUSENTE**.

Cómo se ha revisado:

- 46 filas por decisión manual.
- 1.530 con la regla automática comprobada contra el enunciado del cuestionario y el .sav.
- 915 solo con el .sav: conceptos sin pregunta propia (variables derivadas, muestrales o técnicas) o con enunciado no extraído.
- 69 AUSENTE sin revisión manual (el concepto no está en el estudio).

## Rupturas (C)

| Ruptura | Mes | Qué cambia | Afecta a |
|---|---|---|---|
| R23 | 2021-07 | Práctica religiosa: escala de 5 a 6 categorías | practica_religiosa |
| R25 | 2022-03 | Preferencia como presidente: de lista leída a respuesta espontánea | pref_presidente |
| R26 | 2022-03 | Ocupación: de categorías leídas a respuesta codificada | ocupacion_r, ocupacion_g |
| R04 | 2022-05 | Participación: de 7 a 4 opciones | participacion_g |
| R27 | 2022-07 | Ingresos del hogar: nuevos tramos | ingresos_hogar |
| R09 | 2023-10 | Recuerdo y participación pasan a referirse a las generales de 2023 | recuerdo, participacion_g |
| R19 | 2023-10 | Bloque de intención de voto: nuevo enunciado, precedido de la probabilidad de votar | intención (directa y recodificada), voto + simpatía; B en simpatía e intención alternativa (R28) |
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
   - Las fichas técnicas no detallan el ajuste. Desde nov-2025 (3530) remiten a la página «Muestra y ponderación» del CIS, que incluye el nivel educativo entre las variables.
   - Según la variación del peso en los microdatos, hasta mayo de 2022 PESO solo corrige el reparto por comunidades (19 valores por estudio; sexo y edad van por cuotas), salvo en oct-2021, ene-2022, abr-2022 y may-2022, en que es constante dentro de comunidad × sexo × edad. Desde jun-2022 es constante dentro de comunidad × sexo × edad × tamaño de municipio; desde nov-2023 entra además el nivel de estudios.
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
   - 3489 amplía la muestra de la Comunitat Valenciana: 1.062 entrevistas, frente a unas 400 en los meses vecinos. Eso explica su deff, sin que haya cambio de método (R11, descartada).
8. **Errores en los ficheros del CIS, corregidos en el pipeline.**
   - 3582 (oct-2026): `ESTUDIOS` viene vacía (5.010 de 5.024 casos como N.C.). Se reconstruye desde `NIVELESTENTREV` con la correspondencia de 3571 y 3577; la distribución resultante coincide con la de 3577 a menos de 0,5 pp. La ponderación no está afectada: `ESCIDEOL` reproduce la cifra publicada.
   - 3502: el código 0 de `INTENCIONGALTER` (1.205 casos filtrados) está etiquetado «N.C.»; se trata como «No procede».
   - Códigos de partido sin etiqueta en 3457, 3502 y 3577, y etiquetas ambiguas en 3405 («PNC») y 3413 («Existe»): se resuelven en `codigos_sin_etiqueta.csv`.
9. **No respuesta armonizada por tipo, no por código:** NS (no sabe, «no sabe todavía»), NC (no contesta), NR (no recuerda) y NP (no procede: el entrevistado no recibió la pregunta). NP queda fuera de la base de los porcentajes; NS, NC y NR cuentan en ella, como en las publicaciones del CIS.

## Web

- **Cálculo en el navegador.** Cada vista descarga solo las columnas que necesita (unos cientos de KB) y agrega los microdatos con la ponderación del estudio. No hay servidor.
- **Paneles configurables.** Ocho tipos de gráfico: evolución mensual (líneas, con media móvil de 3 barómetros opcional), un barómetro (barras apiladas al 100 % por grupo), comparación de dos barómetros (con significación), mapa de calor meses × respuestas, transferencias de voto (recuerdo → respuesta actual), dispersión de grupos (dos indicadores, cada punto un electorado o un grupo de perfil), mapa por comunidades y «cada punto, una entrevista» (nube en canvas de todas las entrevistas, sin ponderar y con la muestra igualada por barómetro, coloreada según dos problemas; lleva su propio banner de 1584 × 396). Cruce por una variable de perfil, filtro por otra, periodo, exclusión de NS/NC de la base y margen de error. Hasta 12 respuestas o grupos por panel. Tabla, CSV y PNG por panel; enlace compartible con la configuración.
- **Reponderación por recuerdo de voto (opcional, desactivada por defecto).** `R/recuerdo.R` añade `peso_recuerdo`: raking de los pesos del CIS a cinco márgenes. Participación de todos los que podían votar, con la de los residentes en las generales de referencia (10N 2019 hasta sep-2023; 23J 2023 desde oct-2023); votó o no votó sale del recuerdo y, si este es NS/NC/no recuerda (≈10 % del peso), de la pregunta de participación. Reparto de los votantes que recuerdan su voto entre los partidos principales y el resto, con las cuotas sobre votantes. Sexo, grupo de edad y estudios: la distribución que da el peso del CIS. Fuera quedan quienes no tenían edad o derecho a voto y quienes no responden a ninguna de las dos preguntas (<1 % del peso). La abstención reponderada sobre el total queda en 29,6-30,1 %. Tolerancia 1e-6, máximo 200 iteraciones. Cota de seguridad del factor de ajuste (peso reponderado / peso del CIS) en [0,2, 5]: si algún peso la supera se recorta y se vuelve a rastrillar (hasta cinco pasadas); una cota más estrecha, como 0,3-3, desharía el ajuste de la participación, que exige factores de hasta 5,0 para quien declara no haber votado. Con los barómetros publicados no recorta nada. Datos en `inventario/resultados_electorales.csv`; efecto de diseño resultante, iteraciones, porcentaje de entrevistas recortadas y desvío máximo de los márgenes en `inventario/deff_recuerdo.csv` (deff de 1,4 a 3,0; recorte y desvío, 0). Hasta oct-2026 había un solo margen de recuerdo que excluía NS/NC: la abstención sobre el total quedaba en 26,7 % de media. Es una estimación propia: no reproduce las tablas del CIS y hereda la deriva del recuerdo.
- **Acumulación de barómetros.** Transferencias, dispersión y mapa suman varios barómetros consecutivos para ganar muestra, sin cruzar rupturas C; en la dispersión, los dos ejes usan los mismos barómetros. La media móvil de las líneas es la misma acumulación con tres barómetros: una estimación conjunta en la que cada estudio pesa según sus entrevistas. Un barómetro sin la pregunta, o en el que la respuesta no existía, no cuenta, y ese mes no tiene punto.
- **Líderes y ministros.** La valoración de líderes (batería VALORALIDERES; P25 en ene-2021) y la de ministros (VALMINIS, trimestral; P20 en ene-2021 y P28 en abr-2021) se emparejan por nombre. Gabriel Rufián no figura en ninguna de las dos baterías: solo aparece en la preferencia como presidente (desde feb-2025). Irene Montero se valora como ministra entre ene-2021 y oct-2023 y aparece en la preferencia como presidente desde dic-2022.
- **Navegación y exportación.** La pestaña activa va en la dirección (`#que`, `#series`, `#est`, `#meth`, `#datos`; la estimación elegida, en `#est=base.votante.reparto.alfa`) y el botón atrás funciona; las pestañas se recorren con las flechas. «Restablecer paneles» pide confirmación y «Quitar» se puede deshacer. El CSV y el PNG de cada panel llevan al pie las rupturas marcadas; en el CSV, los textos que empiezan por `=`, `+`, `-` o `@` llevan un apóstrofo delante para que la hoja de cálculo no los ejecute. La web solo carga de los metadatos las notas de los estudios B; la descarga completa los incluye todos.
- **Reglas fijas:** no se muestra ningún punto con menos de 50 entrevistas sin ponderar; margen de error al 95 % con el efecto de diseño de cada estudio; rupturas C marcadas en color y B en punteado; no se calcula la variación mensual a través de una ruptura C (decisión sobre R19).
- **Veda (art. 69.7 LOREG: cinco días antes de la votación, del 24 al 28 de noviembre; la web la mantiene también el 29).** Sin retirada automática. El flujo de publicación conserva un interruptor manual (Actions > Publicar > Run workflow > «Forzar el modo veda») que publica la web sin las series electorales, sin la descarga del fichero completo y con una imagen de vista previa sin series de voto. Un cambio en `main` durante la veda vuelve a publicar en modo normal salvo que se lance a mano con la casilla. «Construye tu estimación» y la probabilidad de ir a votar se retiran también en ese modo.

## Estimación de voto («Construye tu estimación»)

- **Rejilla.** `estimacion/rejilla.R` calcula, en cada barómetro, las 240 combinaciones de cuatro supuestos: base (intención directa, INTENCIONGR, o voto + simpatía, VOTOSIMG) × quién vota (todos los que declaran voto en la base; probabilidad de ir a votar 8-10, 9-10 o 10; todos ponderados por probabilidad/10) × reparto de quien no sabe o no contesta (nada; cascada simpatía → cercanía → recuerdo, recuerdo → simpatía → cercanía o cercanía → simpatía → recuerdo; solo simpatía; regresión) × corrección por recuerdo α (0, 0,25, 0,5, 1). Salidas: `rejilla.csv.gz` (estimación y margen por partido) y `rejilla_info.csv.gz` (n, n efectivo, % sin asignar).
- **Detalles.** Votante probable: con escala (desde sep-2022), quien da la probabilidad elegida y no dice que no votaría; sin escala pero con voto declarado, cuenta; sin escala en el barómetro, cuenta quien no dice que no votaría. La cascada asigna la primera respuesta válida; el recuerdo solo si ese partido se ofrece en la intención del barómetro. La regresión es un logit multinomial (`nnet::multinom`, decay 0,01) ajustado en el mismo barómetro sobre quienes declaran voto en la base, con ideología, recuerdo, valoración de los líderes valorados por al menos la mitad, sexo y edad; los indecisos reciben votos fraccionarios. Peso con corrección parcial: peso del CIS × (peso_recuerdo / peso del CIS)^α. Porcentajes sobre voto válido (partidos y en blanco). Las candidaturas se agrupan como en la estimación del CIS (Unidas Podemos hasta mar-2023; en abr-may 2023, Podemos en Unidas Podemos e IU, Más País y Compromís en Sumar; Sumar con sus socios en jun-dic 2023, Podemos aparte desde ene-2024, Frente Amplio con Sumar en oct-2026).
- **Margen de error.** 1,96 · √(p(1 − p)/n efectivo), con n efectivo = (Σw)²/Σw² sobre los votantes con partido. `estimacion/modelos.R` calcula M1 a M4 con remuestreo (B = 100; 25 en M4) para comprobar la aproximación.
- **Modelos de referencia.** M1 = voto + simpatía / todos / sin reparto / α 0; M2 = lo mismo con α 1; M3 = intención directa / probabilidad 9-10 / cascada simpatía → cercanía → recuerdo / α 1; M4 = igual con regresión. La rejilla reproduce `resultados_modelos.csv` en los cuatro (diferencia máxima 0,005, el redondeo).
- **Estimación del CIS.** `estimacion_cis.csv`: transcripción de la nota de estimación de cada barómetro (un PDF por estudio, dirección en la tabla), sobre voto válido. El CIS cambió de modelo en mayo de 2022. `cotejo_estimacion_cis.py` vuelve a leer la tabla del texto de cada PDF (pdftotext) y la coteja fila a fila: coinciden las 1.069 cifras.
- **Cinco generales.** `historico_armonizar.py` lee los microdatos de 11 encuestas del CIS (3114, 3134, 3141, 3238, 3240, 3242, 3257, 3261, 3263, 3411, 3415; se descargan de cis.es y se extraen en `estimacion/extract/<estudio>/`, fuera del repositorio), asigna los partidos por la etiqueta y los agrupa como concurrieron. `historico_rejilla.R` las repondera como la serie principal (participación y reparto del recuerdo de las generales anteriores; resultados en `resultados_historicos.csv`, con el voto exterior de 2011, 2015 y 2016 aproximado), calcula la rejilla con la misma función, añade los barómetros 3410 y 3413 y escribe el error de cada combinación (`historico_rejilla.csv`, `historico_resumen.csv`). El preelectoral 3117 (20D-2015) no se puede descargar: su ficha en cis.es da error.
- **Publicación.** La rejilla va en el repositorio y se recalcula a mano con cada barómetro nuevo; `scripts/07_estimacion.R` la pasa a `web/datos/estimacion.json` y no escribe nada en modo veda. La prueba de la web comprueba los cuatro atajos en el último barómetro y una muestra del resto.

## Pendiente

- R24 (cambio de la población de referencia de la ponderación, mar-2025): sin verificar en los datos.
- `referencias_cis.csv` cubre ene-2021, oct-2021, oct-2022, oct-2023, mar-2025, mar-2026 y oct-2026 (185 cifras, con las nuevas variables de perfil solo en oct-2026), más la serie de ideología: 181 al redondeo y 4 con una décima de tolerancia (el avance usa una o dos entrevistas más que el fichero). Faltan referencias para problemas, preferencia como presidente, simpatía, cercanía y recuerdo.
- Si el CIS corrige el fichero de 3582, retirar la reconstrucción de `ESTUDIOS`.
- Las 76 comprobaciones de códigos sin lista en el libro de códigos se apoyan solo en el .sav.

Las conclusiones son provisionales. Se derivan de la documentación del CIS y de comprobaciones puntuales en los datos, no de una evaluación del efecto de cada cambio sobre las series.
