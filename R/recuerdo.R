# Reponderación por recuerdo de voto (opcional en la web; no sustituye a la ponderación del CIS)
#
# Dentro de cada barómetro, ajuste iterativo (raking) de los pesos del CIS a cinco márgenes:
#  - participación de quienes podían votar, sobre todos ellos: la de los residentes en España (sin el voto exterior)
#    en las generales de referencia. Votó o no votó sale del recuerdo y, si el recuerdo es NS/NC/no recuerda, de la
#    pregunta de participación. Solo quedan fuera quienes no tenían edad o derecho a voto y quienes no responden a
#    ninguna de las dos;
#  - reparto de los votantes que recuerdan su voto entre los partidos principales y «otros» (resto de partidos,
#    blanco y nulo), con las cuotas sobre votantes de la elección. Quien votó pero no recuerda a quién no entra aquí;
#  - sexo, grupo de edad y nivel de estudios, con la distribución que da el propio peso del CIS, para que el ajuste
#    por recuerdo no la altere.
# La referencia es noviembre de 2019 hasta septiembre de 2023 y julio de 2023 desde octubre (R09).
# Hasta oct-2026 el margen de recuerdo era uno solo (participación y partidos) y excluía a quien no recordaba o no
# contestaba; como casi todos ellos votaron, la abstención sobre el total quedaba por debajo de la real.

CELDAS_RECUERDO <- list(
  "2023-07" = c(PP = "PP", PSOE = "PSOE", VOX = "VOX", SUMAR = "SUMAR"),
  "2019-11" = c(PSOE = "PSOE", PP = "PP", VOX = "VOX", UNIDAS_PODEMOS = "UP", EN_COMU_PODEM = "UP",
                EN_COMUN_UP = "UP", PODEMOS = "UP", CS = "CS")
)
FUERA_DEL_AJUSTE <- c("NO_TENIA_EDAD", "SIN_DERECHO_VOTO", "NS", "NC", "NR", "NP")
SIN_DERECHO <- c("NO_TENIA_EDAD", "SIN_DERECHO_VOTO", "NP")
# pregunta de participación (participacion_g), por etiqueta
PARTICIPACION_VOTO <- c("Votó", "Fue a votar y votó", "Votó por correo")
PARTICIPACION_ABST <- c("No votó", "Prefirió no votar/Me abstuve", "No fue a votar porque no pudo",
                        "Fue a votar pero no pudo hacerlo")
PARTICIPACION_FUERA <- c("No tenía edad para votar", "No tenía derecho a voto", "NS", "NC", "NR", "NP")

objetivos_recuerdo <- function(resultados) {
  r <- split(resultados, resultados$eleccion)
  purrr::imap(r, \(x, el) {
    v <- stats::setNames(as.numeric(x$valor), x$dato)
    part <- (v[["votantes_total"]] - v[["votantes_cera"]]) / (v[["censo_total"]] - v[["censo_cera"]])
    partidos <- setdiff(names(v), c("censo_total", "censo_cera", "votantes_total", "votantes_cera"))
    cuota <- v[partidos] / v[["votantes_total"]]
    list(participacion = c(VOTO = part, ABST = 1 - part), voto = c(cuota, OTROS = 1 - sum(cuota)))
  })
}

# partido recordado (NA si no votó, no recuerda o no podía votar)
celda_recuerdo <- function(rec, eleccion) {
  rec <- as.character(rec)
  mapa <- CELDAS_RECUERDO[[eleccion]]
  dplyr::case_when(
    is.na(rec) | rec %in% c(FUERA_DEL_AJUSTE, "NO_VOTO") ~ NA_character_,
    rec %in% names(mapa) ~ unname(mapa[rec]),
    TRUE ~ "OTROS"
  )
}

# votó (VOTO) o no (ABST) entre quienes podían votar: del recuerdo y, si no lo da, de la pregunta de participación
celda_participacion <- function(rec, part) {
  rec <- as.character(rec); part <- as.character(part)
  desconocida <- setdiff(unique(part[!is.na(part)]), c(PARTICIPACION_VOTO, PARTICIPACION_ABST, PARTICIPACION_FUERA))
  if (length(desconocida)) stop("participacion_g: categorías sin clasificar: ", paste(desconocida, collapse = ", "))
  dplyr::case_when(
    rec %in% SIN_DERECHO ~ NA_character_,
    rec == "NO_VOTO" ~ "ABST",
    !is.na(rec) & !rec %in% FUERA_DEL_AJUSTE ~ "VOTO",
    part %in% PARTICIPACION_VOTO ~ "VOTO",
    part %in% PARTICIPACION_ABST ~ "ABST",
    TRUE ~ NA_character_
  )
}

MARGENES_SOCIO <- c("sexo", "edad_g", "estudios")
RAKING_TOL <- 1e-6
RAKING_MAX_ITER <- 200

# raking de un estudio: w0 = peso del CIS; margenes = lista de list(cel, obj), con cel = celda de cada entrevista
# (NA fuera del margen) y obj = proporciones objetivo dentro del margen; socio = márgenes que conservan el peso del CIS
rastrillar <- function(w0, margenes, socio) {
  w <- w0
  margenes <- lapply(margenes, \(m) {
    dentro <- !is.na(m$cel)
    presentes <- intersect(names(m$obj), unique(m$cel[dentro]))
    list(cel = m$cel, dentro = dentro, obj = m$obj[presentes] / sum(m$obj[presentes]))
  })
  objetivo_socio <- lapply(socio, \(x) tapply(w0, x, sum))
  for (it in seq_len(RAKING_MAX_ITER)) {
    w_ant <- w
    for (m in margenes) {
      tb <- sum(w[m$dentro])
      actual <- tapply(w[m$dentro], m$cel[m$dentro], sum)
      f <- m$obj[names(actual)] * tb / actual
      w[m$dentro] <- w[m$dentro] * f[m$cel[m$dentro]]
    }
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
    margenes <- list(
      list(cel = celda_participacion(d$recuerdo_voto[i], d$participacion_g[i]), obj = obj[[el]]$participacion),
      list(cel = celda_recuerdo(d$recuerdo_voto[i], el), obj = obj[[el]]$voto)
    )
    socio <- lapply(MARGENES_SOCIO, \(v) { x <- as.character(d[[v]][i]); x[is.na(x)] <- "NA"; x })
    r <- rastrillar(d$peso[i], margenes, socio)
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
