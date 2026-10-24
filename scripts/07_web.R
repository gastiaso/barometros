# Datos para la web: cada columna del fichero armonizado como un binario comprimido (deflate) que el navegador
# descomprime con DecompressionStream. Así la página solo descarga las columnas que necesita cada vista.
#
# Uso:  Rscript scripts/07_web.R            (desde la raíz; requiere haber ejecutado targets::tar_make())
#       VEDA=1 Rscript scripts/07_web.R     (sin series electorales: periodo de prohibición del art. 69.7 LOREG)

suppressPackageStartupMessages({ library(arrow); library(dplyr); library(jsonlite) })

PUB <- "datos/publicacion"
WEB <- "web/datos"
VEDA <- identical(Sys.getenv("VEDA"), "1")

# Series que no se difunden durante la veda: intención, simpatía, cercanía, preferencia como presidente y líderes.
# El recuerdo de voto (pasado) y el resto de series se mantienen.
ELECTORALES <- c("intencion_voto", "intencion_voto_r", "intencion_alternativa", "voto_simpatia", "simpatia",
                 "cercania", "pref_presidente")

d <- read_parquet(file.path(PUB, "microdatos.parquet")) |> arrange(estudio)
meta <- read_json(file.path(PUB, "metadatos.json"))
retirar <- if (VEDA) c(ELECTORALES, grep("^(lider|ministro)_", names(d), value = TRUE)) else character(0)

unlink(WEB, recursive = TRUE)
dir.create(file.path(WEB, "col"), recursive = TRUE)

# filas de cada estudio (el fichero está ordenado por estudio)
est <- d |> mutate(fila = row_number() - 1L) |> group_by(estudio, mes) |>
  summarise(desde = min(fila), hasta = max(fila) + 1L, .groups = "drop")

enteros_cortos <- c("ideologia", "edad", grep("^(lider|ministro)_", names(d), value = TRUE))
columnas <- list()
for (k in setdiff(names(d), c("estudio", "mes", retirar))) {
  x <- d[[k]]
  if (is.factor(x)) {
    niveles <- levels(x)
    cod <- as.integer(x); cod[is.na(cod)] <- 0L
    bytes <- if (length(niveles) <= 255) 1L else 2L
    raw <- writeBin(cod, raw(), size = bytes, endian = "little")
    columnas[[k]] <- list(tipo = "cat", bytes = bytes, niveles = niveles)
  } else if (k %in% enteros_cortos) {
    v <- as.integer(round(x)); v[is.na(v)] <- 0L
    stopifnot(all(v >= 0 & v <= 255))
    raw <- writeBin(v, raw(), size = 1, endian = "little")
    columnas[[k]] <- list(tipo = "num", bytes = 1L, cero_es_nulo = TRUE)
  } else {
    raw <- writeBin(as.numeric(x), raw(), size = 4, endian = "little")
    columnas[[k]] <- list(tipo = "num", bytes = 4L, flotante = TRUE)
  }
  writeBin(memCompress(raw, type = "gzip"), file.path(WEB, "col", paste0(k, ".bin")))
  columnas[[k]]$archivo <- paste0("col/", k, ".bin")
}

if (VEDA) {
  meta$conceptos <- meta$conceptos[setdiff(names(meta$conceptos), retirar)]
}
# de la situación de cada pregunta en cada estudio, la web solo usa las notas de los estudios B: el resto se queda en
# la descarga completa de los metadatos (menos peso al arrancar)
meta$conceptos <- lapply(meta$conceptos, \(k) {
  if (!is.null(k$estudios)) k$estudios <- Filter(\(x) identical(x$nivel, "B") && !is.null(x$nota), k$estudios)
  k
})
# enunciados de cada pregunta (versiones con su periodo), para la nota metodológica
# Se limpian restos de maquetación del cuestionario, las tres menciones de problemas van en una sola ficha, la
# nacionalidad queda en su versión con texto completo y se añaden las preguntas sin enunciado extraído
# (inventario/enunciados_adicionales.csv). Si tras limpiar dos versiones seguidas tienen el mismo texto, se unen.
leer_enun <- function(f) readr::read_csv(f, col_types = readr::cols(.default = "c"), progress = FALSE)
limpiar_enunciado <- function(x) {
  x <- sub("\\s*</span.*$", "", x)
  x <- sub("\\s*\\.?\\s*(CURSO|NOMBRE DE ESTUDIOS)\\b.*$", "", x)
  x <- sub("\\s*Controles:.*$", "", x)
  x <- sub("\\s*Si P0a=3 ir a fin de cuestionario\\.?$", "", x)
  x <- sub("\\s*1er\\. Problema$", "", x)
  x <- sub("\\?\\s+\\.$", "?", x)
  x <- sub("\\s+\\.$", ".", x)
  trimws(x)
}
enun <- leer_enun("inventario/enunciados_versiones.csv") |>
  dplyr::mutate(enunciado = limpiar_enunciado(enunciado),
                concepto = sub("^(prob_(esp|per))_[123]$", "\\1", concepto)) |>
  dplyr::distinct(concepto, version, .keep_all = TRUE) |>
  dplyr::filter(!(concepto == "nacionalidad" & version != "1")) |>
  dplyr::mutate(enunciado = dplyr::if_else(concepto == "nacionalidad",
    paste0(enunciado, " (la nacionalidad española / la nacionalidad española y otra / otra nacionalidad)"), enunciado)) |>
  dplyr::bind_rows(leer_enun("inventario/enunciados_adicionales.csv")) |>
  dplyr::arrange(concepto, desde) |>
  dplyr::group_by(concepto) |>
  dplyr::mutate(grupo = cumsum(enunciado != dplyr::lag(enunciado, default = ""))) |>
  dplyr::group_by(concepto, grupo) |>
  dplyr::summarise(version = dplyr::first(version), desde = min(desde), hasta = max(hasta),
                   n_estudios = sum(as.integer(n_estudios)), enunciado = dplyr::first(enunciado), .groups = "drop")
meta$enunciados <- split(dplyr::select(enun, version, desde, hasta, n_estudios, enunciado), enun$concepto)
meta$veda <- VEDA
meta$filas <- nrow(d)
meta$tramos_estudio <- est
meta$columnas <- columnas
write_json(meta, file.path(WEB, "metadatos.json"), auto_unbox = TRUE, na = "null", null = "null", dataframe = "rows")

# descargas: el fichero completo solo fuera de la veda
if (!VEDA) {
  dir.create(file.path(WEB, "descargas"))
  file.copy(file.path(PUB, "microdatos.parquet"), file.path(WEB, "descargas", "barometros_armonizados.parquet"))
  file.copy(file.path(PUB, "metadatos.json"), file.path(WEB, "descargas", "metadatos.json"))
}
# datos estructurados para buscadores: cobertura temporal y fecha de actualización
actualizar <- function(ruta, patron, valor) {
  x <- readLines(ruta, encoding = "UTF-8", warn = FALSE)
  writeLines(sub(patron, valor, x), ruta, useBytes = TRUE)
}
meses <- range(as.character(est$mes))
hoy <- format(Sys.Date())
actualizar("web/index.html", '"temporalCoverage": "[0-9-]+/[0-9-]+"', sprintf('"temporalCoverage": "%s/%s"', meses[1], meses[2]))
actualizar("web/index.html", '"dateModified": "[0-9-]+"', sprintf('"dateModified": "%s"', hoy))
actualizar("web/sitemap.xml", "<lastmod>[0-9-]+</lastmod>", sprintf("<lastmod>%s</lastmod>", hoy))
# en veda no hay descargas: se quitan de los datos estructurados
if (VEDA) {
  x <- paste(readLines("web/index.html", encoding = "UTF-8", warn = FALSE), collapse = "\n")
  writeLines(sub(',\\s*"distribution": \\[[^]]*\\]', "", x, perl = TRUE), "web/index.html", useBytes = TRUE)
}

tam <- sum(file.size(list.files(WEB, recursive = TRUE, full.names = TRUE)))
cat(sprintf("web/datos: %d columnas, %.1f MB%s\n", length(columnas), tam / 1e6, if (VEDA) " (veda)" else ""))
