# Reponderación por recuerdo de voto (opcional en la web; no sustituye a la ponderación del CIS)
#
# Dentro de cada barómetro, ajuste iterativo (raking) de los pesos del CIS a cuatro márgenes:
#  - recuerdo de voto de quienes podían votar: participación entre los residentes en España (sin el voto exterior)
#    y reparto de los votantes entre los partidos principales y «otros» (resto de partidos, blanco y nulo) en las
#    generales de referencia. Quien no tenía edad o derecho a voto, o no recuerda o no contesta, no entra en este margen;
#  - sexo, grupo de edad y nivel de estudios, con la distribución que da el propio peso del CIS, para que el ajuste
#    por recuerdo no la altere.
# La referencia es noviembre de 2019 hasta septiembre de 2023 y julio de 2023 desde octubre (R09).

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

MARGENES_SOCIO <- c("sexo", "edad_g", "estudios")
RAKING_TOL <- 1e-6
RAKING_MAX_ITER <- 200

# raking de un estudio: w0 = peso del CIS; cel = celda de recuerdo (NA fuera del margen); obj = proporciones objetivo
rastrillar <- function(w0, cel, obj, socio) {
  w <- w0
  bloque <- !is.na(cel)
  presentes <- intersect(names(obj), unique(cel[bloque]))
  obj <- obj[presentes] / sum(obj[presentes])
  objetivo_socio <- lapply(socio, \(x) tapply(w0, x, sum))
  for (it in seq_len(RAKING_MAX_ITER)) {
    w_ant <- w
    tb <- sum(w[bloque])
    actual <- tapply(w[bloque], cel[bloque], sum)
    f <- obj[names(actual)] * tb / actual
    w[bloque] <- w[bloque] * f[cel[bloque]]
    for (k in seq_along(socio)) {
      actual <- tapply(w, socio[[k]], sum)
      f <- objetivo_socio[[k]][names(actual)] / actual
      w <- w * unname(f[as.character(socio[[k]])])
    }
    if (max(abs(w / w_ant - 1)) < RAKING_TOL) return(list(w = w, iter = it))
  }
  warning("raking sin converger en ", RAKING_MAX_ITER, " iteraciones")
  list(w = w, iter = NA_integer_)
}

ponderar_recuerdo <- function(d, resultados) {
  obj <- objetivos_recuerdo(resultados)
  d$peso_recuerdo <- d$peso
  for (e in unique(d$estudio)) {
    i <- which(d$estudio == e)
    el <- if (d$mes[i[1]] >= "2023-10") "2023-07" else "2019-11"
    cel <- celda_recuerdo(d$recuerdo_voto[i], el)
    socio <- lapply(MARGENES_SOCIO, \(v) { x <- as.character(d[[v]][i]); x[is.na(x)] <- "NA"; x })
    r <- rastrillar(d$peso[i], cel, obj[[el]], socio)
    d$peso_recuerdo[i] <- r$w
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
