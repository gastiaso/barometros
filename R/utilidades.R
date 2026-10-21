# Utilidades comunes: normalización de etiquetas, no respuesta y lectura de valores de un .sav

# Conceptos por tipo de armonización ---------------------------------------------------------
CONCEPTOS_PARTIDO <- c("intencion_voto", "intencion_voto_r", "intencion_alternativa", "voto_simpatia",
                       "simpatia", "cercania", "recuerdo_voto", "recuerdo_votantes_r")
CONCEPTOS_PROBLEMA <- c("prob_esp_1", "prob_esp_2", "prob_esp_3", "prob_per_1", "prob_per_2", "prob_per_3")
CONCEPTOS_CANDIDATO <- "pref_presidente"
CONCEPTOS_CERRADOS <- c("eco_esp", "eco_per", "participacion_g", "sexo", "ccaa", "provincia", "tamuni",
                        "estudios", "nivel_estudios", "sitlab", "ocupacion_r", "clase_subjetiva", "clase_social",
                        "religiosidad", "practica_religiosa", "estado_civil")
CONCEPTOS_PESO <- c("peso", "peso_ccaa")

# Tipos de no respuesta. NP (no procede: filtro) queda fuera de la base; NS, NC y NR cuentan en ella.
NO_RESPUESTA <- c(NS = "No sabe", NC = "No contesta", NR = "No recuerda", NP = "No procede")
RX_NO_RESPUESTA <- "^(n s|n c|n p|n r|no sabe|no contesta|no procede|no recuerda)( |$)"

norm_etiqueta <- function(x) {
  x <- iconv(enc2utf8(as.character(x)), "UTF-8", "ASCII//TRANSLIT", sub = "")
  x <- tolower(x)
  x <- gsub("[^a-z0-9]+", " ", x)
  trimws(gsub("\\s+", " ", x))
}

# Misma categoría con otra redacción: idéntica, truncada, mismas palabras en otro orden o casi idéntica.
# Solo se usa entre etiquetas del mismo código.
relacionadas <- function(a, b) {
  a <- norm_etiqueta(a)
  b <- norm_etiqueta(b)
  if (identical(a, b)) return(TRUE)
  if (min(nchar(a), nchar(b)) >= 4 && (startsWith(a, b) || startsWith(b, a))) return(TRUE)
  if (setequal(strsplit(a, " ")[[1]], strsplit(b, " ")[[1]])) return(TRUE)
  1 - utils::adist(a, b)[1, 1] / max(nchar(a), nchar(b)) >= 0.9
}

# El código 0 (y -99) es siempre «no procede»: en 3502 (INTENCIONGALTER) el CIS lo etiqueta «N.C.» por error.
tipo_no_respuesta <- function(etiqueta, codigo) {
  e <- norm_etiqueta(ifelse(is.na(etiqueta), "", etiqueta))
  dplyr::case_when(
    codigo %in% c(0, -99) ~ "NP",
    grepl("^(n p|no procede)", e) ~ "NP",
    grepl("^(n r|no recuerda)", e) ~ "NR",
    grepl("^(n s|no sabe)", e) ~ "NS",
    TRUE ~ "NC"
  )
}

# Código, etiqueta y marca de no respuesta de cada caso. La no respuesta es la declarada como
# user-missing en el .sav o la que tiene etiqueta de no respuesta (en algunos estudios no se declara).
valores_sav <- function(x) {
  v <- as.numeric(unclass(x))
  labs <- attr(x, "labels", exact = TRUE)
  et <- if (is.null(labs)) rep(NA_character_, length(v)) else names(labs)[match(v, unname(labs))]
  decl <- v %in% attr(x, "na_values", exact = TRUE)
  rng <- attr(x, "na_range", exact = TRUE)
  if (!is.null(rng)) decl <- decl | (!is.na(v) & v >= rng[1] & v <= rng[2])
  nr <- decl | (!is.na(et) & grepl(RX_NO_RESPUESTA, norm_etiqueta(et)))
  tibble::tibble(codigo = v, etiqueta = et, nr = nr)
}

cod_chr <- function(v) ifelse(is.na(v), NA_character_, format(v, scientific = FALSE, trim = TRUE, drop0trailing = TRUE))

ruta_sav <- function(estudio, raiz = ".") {
  f <- list.files(file.path(raiz, "datos", "extract", estudio), pattern = "(?i)\\.sav$", full.names = TRUE)
  if (length(f) != 1) stop("No hay un único .sav para el estudio ", estudio)
  f
}
