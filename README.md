# cis-barometros

Herramienta de series históricas a partir de los microdatos de los barómetros mensuales del CIS. La ventana va de enero de 2021 a octubre de 2026: **64 estudios**, todos desde el primer barómetro posterior a la etapa COVID.

**Estado:** crosswalk revisado contra cuestionarios, libros de códigos y fichas técnicas, con tablas de armonización de partidos, problemas y candidatos. Todavía no hay pipeline de armonización ni interfaz.

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
```

Para reproducir hace falta Python 3 con `pyreadstat`, `pandas` y `openpyxl`, y poppler (`pdftotext`, `pdfinfo`). Los comandos se lanzan desde la raíz del proyecto:

```
python scripts/00_extraer.py .
python scripts/01_inventario.py .
python scripts/02_crosswalk.py .
python scripts/03_textos.py .
python scripts/04_enunciados.py .
python scripts/05_revision.py .
python scripts/06_revision_xlsx.py .
```

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
| `partidos_armonizados.csv` | Las 195 etiquetas de partido → 177 identificadores, con nota |
| `mapa_problemas.csv` | Estudio × código → problema armonizado (98 categorías) |
| `mapa_candidatos.csv` | Estudio × código → candidato (PREFPTE) |
| `codigos_cambio_significado_revisado.csv` | Los 89 códigos que cambian de etiqueta, verificados contra el libro de códigos o el cuestionario, con su resolución |
| `revision.xlsx` | Todo lo anterior con formato y filtros; columna `comentario` en amarillo para anotaciones |

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

## Verificación

- **Cifras contra el CIS.** En 3577 y 3582, la distribución ponderada de `ESCIDEOL` reproduce la serie publicada por el CIS: 0,0 pp en las categorías 1–10 y la misma media (4,61 y 4,51).
- **Revisión contra la documentación.** Se han leído los 64 cuestionarios, libros de códigos y fichas técnicas.
  - Los enunciados se extraen por la marca de variable del cuestionario. Hay 27 extracciones dudosas o fallidas de 1.406; se comprobaron a mano las que afectaban a cambios de versión.
  - Los 89 códigos que cambian de etiqueta suman 195 comprobaciones (una por periodo de cada etiqueta). 116 coinciden con el libro de códigos (85) o con el cuestionario (31). 3 son variantes de redacción. 76 no tienen lista disponible, por el formato abreviado de 22 libros de códigos.
- **Verificación independiente.** Un agente que no había participado en la revisión contrastó 13 afirmaciones con las fuentes primarias. Todas se sostienen. Entre ellas están R04, R06, R19–R23, el hueco de 3355, la sobremuestra de 3489, los códigos de problema reutilizados, el cruce de marcas de 3344, una muestra de partidos y de filas A, y las cifras de `ESCIDEOL` en 3582 (18,9 % en el valor 1 y media de 4,51).
- **Integridad.** Los 64 ZIP son válidos y los 64 .sav se leen. Todo el pipeline se ejecuta de principio a fin desde esta estructura de carpetas.

## Pendiente

- R24 (cambio de la población de referencia de la ponderación, mar-2025): sin verificar en los datos.
- Las 76 comprobaciones de códigos sin lista en el libro de códigos se apoyan solo en el .sav.

Las conclusiones son provisionales. Se derivan de la documentación del CIS y de comprobaciones puntuales en los datos, no de una evaluación del efecto de cada cambio sobre las series.
