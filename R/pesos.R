# Peso homogéneo con nivel de estudios (opcional en la web; no sustituye a la ponderación del CIS)
#
# Desde noviembre de 2023 (R10) el peso del CIS ajusta también por nivel de estudios y la muestra ponderada pasa de un
# 45 % a un 26 % de personas con estudios superiores. Antes no, y por eso R10 corta todas las series. `peso_estudios`
# es el peso del CIS de cada barómetro anterior a noviembre de 2023 ajustado por raking al nivel de estudios dentro de
# cada celda de sexo × grupo de edad (conservando la distribución de sexo × edad que da el propio peso), con los
# márgenes de inventario/margenes_estudios.csv; desde noviembre de 2023 es el peso del CIS tal cual. Quien no da su
# nivel de estudios, o no tiene sexo o edad, queda fuera del ajuste de estudios y solo recibe el de su celda.
# Es una estimación propia: hace comparables las series a través de R10 al precio de una hipótesis sobre la
# estructura educativa de la población en 2021-2023 (la de los márgenes) y de un efecto de diseño mayor.

PRIMER_ESTUDIO_CON_ESTUDIOS <- "2023-11"   # desde aquí, PESO ya lleva el ajuste por estudios
# Cota del factor de ajuste, más ancha que la del recuerdo: las muestras de 2021-2023 tienen muy pocos jóvenes con
# estudios bajos (en algún barómetro, 6 hombres de 25 a 34 con primera etapa de secundaria donde el margen pide el 29 %)
# y el propio peso del CIS con estudios llega a factores de 8 a 17 respecto a un peso solo con sexo y edad. Con 10, el
# desvío que queda en los márgenes es pequeño (inventario/deff_estudios.csv lo da por estudio).
COTA_ESTUDIOS <- c(0.2, 10)

# Márgenes: estudios por celda de sexo × grupo de edad, como proporciones dentro de la celda
leer_margenes_estudios <- function(ruta) {
  m <- readr::read_csv(ruta, col_types = readr::cols(.default = "c"), show_col_types = FALSE)
  faltan <- setdiff(c("sexo", "edad_g", "estudios", "p"), names(m))
  if (length(faltan)) stop("margenes_estudios.csv: faltan columnas ", paste(faltan, collapse = ", "))
  m$p <- as.numeric(m$p)
  m |> dplyr::group_by(sexo, edad_g) |> dplyr::mutate(p = p / sum(p)) |> dplyr::ungroup()
}

ponderar_estudios <- function(d, margenes) {
  d$peso_estudios <- d$peso
  diag <- list()
  celdas <- split(margenes, paste(margenes$sexo, margenes$edad_g))
  for (e in unique(d$estudio[d$mes < PRIMER_ESTUDIO_CON_ESTUDIOS])) {
    i <- which(d$estudio == e)
    est <- as.character(d$estudios[i]); est[est %in% names(NO_RESPUESTA)] <- NA
    celda <- ifelse(is.na(d$sexo[i]) | is.na(d$edad_g[i]), NA, paste(d$sexo[i], d$edad_g[i]))
    margenes_e <- lapply(intersect(names(celdas), unique(celda[!is.na(celda)])), \(k) {
      obj <- stats::setNames(celdas[[k]]$p, celdas[[k]]$estudios)
      cel <- ifelse(!is.na(celda) & celda == k & est %in% names(obj), est, NA_character_)
      list(cel = cel, obj = obj)
    })
    socio <- list(ifelse(is.na(celda), "NA", celda))
    r <- rastrillar(d$peso[i], margenes_e, socio, cota = COTA_ESTUDIOS)
    d$peso_estudios[i] <- r$w
    diag[[length(diag) + 1]] <- tibble::tibble(estudio = e, iteraciones = r$iter, pct_recortado = 100 * mean(r$recortado),
                                                desvio_max = round(r$desvio_max, 6))
  }
  attr(d, "raking_estudios") <- dplyr::bind_rows(diag)
  d
}

# efecto de diseño de Kish de cada estudio con el peso homogéneo, factores extremos y diagnóstico del raking
deff_estudios <- function(d) {
  out <- d |>
    dplyr::group_by(estudio) |>
    dplyr::summarise(deff_estudios = dplyr::n() * sum(peso_estudios^2) / sum(peso_estudios)^2,
                     factor_max = max(peso_estudios / peso), factor_min = min(peso_estudios / peso), .groups = "drop")
  diag <- attr(d, "raking_estudios", exact = TRUE)
  if (!is.null(diag)) out <- dplyr::left_join(out, diag, by = "estudio")
  out
}
