# Reponderación por recuerdo de voto (opcional en la web; no sustituye a la ponderación del CIS)
#
# Dentro de cada barómetro se ajustan los pesos del CIS para que el recuerdo de voto de quienes podían votar
# reproduzca el resultado real de las generales de referencia: participación entre los residentes en España
# (sin el voto exterior) y reparto de los votantes entre los partidos principales y «otros» (resto de
# partidos, blanco y nulo). Quien no tenía edad o derecho a voto, o no recuerda o no contesta, conserva su
# peso. La referencia es noviembre de 2019 hasta septiembre de 2023 y julio de 2023 desde octubre (R09).

CELDAS_RECUERDO <- list(
  "2023-07" = c(PP = "PP", PSOE = "PSOE", VOX = "VOX", SUMAR = "SUMAR"),
  "2019-11" = c(PSOE = "PSOE", PP = "PP", VOX = "VOX", UNIDAS_PODEMOS = "UP", EN_COMU_PODEM = "UP",
                EN_COMUN_UP = "UP", PODEMOS = "UP", CS = "CS")
)
FUERA_DEL_AJUSTE <- c("NO_TENIA_EDAD", "SIN_DERECHO_VOTO", "NS", "NC", "NR", "NP")

objetivos_recuerdo <- function(resultados) {
  r <- split(resultados, resultados$eleccion)
  purrr::imap(r, \(x, el) {
    v <- stats::setNames(as.numeric(x$valor), x$dato)
    part <- (v[["votantes_total"]] - v[["votantes_cera"]]) / (v[["censo_total"]] - v[["censo_cera"]])
    partidos <- setdiff(names(v), c("censo_total", "censo_cera", "votantes_total", "votantes_cera"))
    cuota <- v[partidos] / v[["votantes_total"]]
    c(part * cuota, OTROS = part * (1 - sum(cuota)), ABST = 1 - part)
  })
}

celda_recuerdo <- function(rec, eleccion) {
  rec <- as.character(rec)
  mapa <- CELDAS_RECUERDO[[eleccion]]
  dplyr::case_when(
    is.na(rec) | rec %in% FUERA_DEL_AJUSTE ~ NA_character_,
    rec == "NO_VOTO" ~ "ABST",
    rec %in% names(mapa) ~ unname(mapa[rec]),
    TRUE ~ "OTROS"
  )
}

ponderar_recuerdo <- function(d, resultados) {
  obj <- objetivos_recuerdo(resultados)
  d$peso_recuerdo <- d$peso
  for (e in unique(d$estudio)) {
    i <- which(d$estudio == e)
    el <- if (d$mes[i[1]] >= "2023-10") "2023-07" else "2019-11"
    cel <- celda_recuerdo(d$recuerdo_voto[i], el)
    bloque <- !is.na(cel)
    wb <- sum(d$peso[i][bloque])
    actual <- tapply(d$peso[i][bloque], cel[bloque], sum)
    f <- obj[[el]][names(actual)] * wb / actual
    f[!is.finite(f)] <- 1
    d$peso_recuerdo[i][bloque] <- d$peso[i][bloque] * f[cel[bloque]]
  }
  d
}

# efecto de diseño de Kish de cada estudio con los pesos reponderados
deff_recuerdo <- function(d) {
  d |>
    dplyr::group_by(estudio) |>
    dplyr::summarise(deff_recuerdo = dplyr::n() * sum(peso_recuerdo^2) / sum(peso_recuerdo)^2,
                     factor_max = max(peso_recuerdo / peso), factor_min = min(peso_recuerdo / peso), .groups = "drop")
}
