# «Construye tu propia estimación»: todas las combinaciones de cuatro supuestos, en cada barómetro.
# Estimaciones puntuales; margen de error aproximado por el tamaño efectivo de la muestra (como el resto de la web).
# Uso (desde la raíz, después de targets::tar_make()):  Rscript estimacion/rejilla.R
#
# Supuestos (los cuatro modelos de referencia son combinaciones de ellos):
#   base      intención directa (INTENCIONGR) o voto + simpatía (VOTOSIMG)
#   votante   quién cuenta: todos los que declaran voto en la base; probabilidad de ir a votar 8-10, 9-10 o 10; o
#             todos, ponderados por probabilidad/10. Sin pregunta de probabilidad (hasta ago-2022) las cuatro
#             últimas coinciden: cuenta quien no dice que no votaría.
#   reparto   qué se hace con quien no sabe o no contesta: nada (queda fuera), una cascada de preguntas en el
#             orden elegido (simpatía, partido más cercano, recuerdo de voto) o una regresión (como M4)
#   alfa      intensidad de la corrección por recuerdo: 0 (peso del CIS), 0,25, 0,5 o 1 (peso_recuerdo).
#             Peso = peso del CIS × (peso_recuerdo / peso del CIS)^alfa: con alfa < 1 cada factor de ajuste se
#             acerca a 1.
#   M1 = simpatia/todos/ninguno/0   M2 = simpatia/todos/ninguno/1   M3 = intencion/p9/scr/1   M4 = intencion/p9/regresion/1

lineas <- readLines("estimacion/modelos.R")
eval(parse(text = lineas[1:(grep("^# -+ estimaciones de un estudio", lineas) - 1)]))

BASES <- c(intencion = "intencion_voto", simpatia = "voto_simpatia")
VOTANTES <- list(todos = NULL, p8 = \(p) as.numeric(p >= 8), p9 = \(p) as.numeric(p >= 9),
                 p10 = \(p) as.numeric(p == 10), pond = \(p) p / 10)
REPARTOS <- list(ninguno = character(0), scr = c("simpatia", "cercania", "recuerdo"),
                 rsc = c("recuerdo", "simpatia", "cercania"), csr = c("cercania", "simpatia", "recuerdo"),
                 s = "simpatia", regresion = NULL)
ALFAS <- c(0, 0.25, 0.5, 1)

# peso de cada entrevistado como votante (0 a 1). «Todos»: sin filtro, decide la variable base (como M1 y M2, y como
# las tablas de voto + simpatía del CIS). Con la escala, quien dice que no votaría cuenta 0.
peso_votante_r <- function(e, nombre) {
  no <- e$intencion_voto %in% "NO_VOTARIA"
  f <- VOTANTES[[nombre]]
  if (is.null(f)) return(rep(1, nrow(e)))
  if (all(is.na(e$prob_votar))) return(as.numeric(!no))
  t <- f(e$prob_votar)
  t[is.na(e$prob_votar)] <- as.numeric(valido(e$intencion_voto[is.na(e$prob_votar)]))   # sin escala pero con voto declarado
  t[no] <- 0
  t
}
cascada_b <- function(e, y, orden) {
  ofrecidos <- unique(e$intencion_voto[valido(e$intencion_voto)])
  rec <- dplyr::coalesce(unname(RECUERDO_A_INTENCION[e$recuerdo_voto]), e$recuerdo_voto)
  rec[!(rec %in% ofrecidos)] <- NA
  fuentes <- list(simpatia = e$voto_simpatia, cercania = e$cercania, recuerdo = rec)
  v <- ifelse(valido(y), y, NA)
  und <- indeciso(y)
  for (k in orden) {
    alt <- fuentes[[k]]
    usar <- und & is.na(v) & valido(alt)
    v[usar] <- alt[usar]
  }
  v
}
# regresión logística multinomial (la de M4) con la variable base y un peso cualquiera
regresion <- function(e, y, w) {
  dec <- w > 0 & valido(y)
  und <- w > 0 & indeciso(y)
  lideres <- grep("^lider_", names(e), value = TRUE)
  lideres <- lideres[vapply(lideres, \(l) mean(!is.na(e[[l]])) >= LIDER_MIN, logical(1))]
  X <- diseno(e, lideres)
  frec <- table(y[dec])
  clases <- names(frec)[frec >= 25]
  yc <- ifelse(y %in% clases, y, "RESTO")
  ajuste <- nnet::multinom(factor(yc[dec]) ~ ., data = X[dec, , drop = FALSE], weights = w[dec] / mean(w[dec]),
                           trace = FALSE, maxit = 300, decay = 0.01, MaxNWts = 5000)
  tot <- tapply(w[dec], y[dec], sum)
  if (any(und)) {
    p <- predict(ajuste, newdata = X[und, , drop = FALSE], type = "probs")
    if (is.null(dim(p))) p <- matrix(p, nrow = sum(und), dimnames = list(NULL, ajuste$lev))
    imp <- colSums(p * w[und])
    resto <- setdiff(names(tot), clases)
    if ("RESTO" %in% names(imp) && length(resto)) tot[resto] <- tot[resto] + imp[["RESTO"]] * tot[resto] / sum(tot[resto])
    comunes <- intersect(names(imp), clases)
    tot[comunes] <- tot[comunes] + imp[comunes]
  }
  list(tot = tot, incl = dec | und, asignado = sum(w[dec | und]))
}
margen <- function(p, neff) round(196 * sqrt(p * (1 - p) / neff), 2)

una_rejilla <- function(e) {
  hay_prob <- !all(is.na(e$prob_votar))
  votantes <- if (hay_prob) names(VOTANTES) else "todos"
  g <- e$peso_recuerdo / e$peso
  est <- list(); info <- list()
  for (bn in names(BASES)) {
    y <- e[[BASES[[bn]]]]
    for (vn in votantes) {
      t <- peso_votante_r(e, vn)
      for (a in ALFAS) {
        w <- e$peso * g^a * t
        elegibles <- w > 0 & (valido(y) | indeciso(y))
        for (rn in names(REPARTOS)) {
          if (rn == "regresion") {
            r <- tryCatch(regresion(e, y, w), error = function(err) NULL)
            if (is.null(r)) next
            tot <- r$tot; incl <- r$incl
          } else {
            v <- cascada_b(e, y, REPARTOS[[rn]])
            incl <- w > 0 & valido(v)
            tot <- tapply(w[incl], v[incl], sum)
          }
          p <- tot / sum(tot)
          neff <- sum(w[incl])^2 / sum(w[incl]^2)
          clave <- list(base = bn, votante = vn, reparto = rn, alfa = a)
          est[[length(est) + 1]] <- tibble::tibble(!!!clave, partido = names(p), est = round(100 * as.numeric(p), 2),
                                                   me = margen(as.numeric(p), neff))
          info[[length(info) + 1]] <- tibble::tibble(!!!clave, n = sum(incl), n_efectivo = round(neff),
            fuera = round(100 * (1 - sum(w[incl]) / sum(w[elegibles])), 1), hay_prob = hay_prob)
        }
      }
    }
  }
  est <- dplyr::bind_rows(est); info <- dplyr::bind_rows(info)
  if (!hay_prob) {   # sin pregunta de probabilidad: las cinco definiciones de votante coinciden
    copia <- \(x) dplyr::bind_rows(lapply(names(VOTANTES), \(vn) dplyr::mutate(x, votante = vn)))
    est <- copia(est); info <- copia(info)
  }
  m <- list(estudio = e$estudio[1], mes = e$mes[1])
  list(est = dplyr::mutate(est, !!!m), info = dplyr::mutate(info, !!!m))
}

if (sys.nframe() == 0L) {
  t0 <- Sys.time()
  estudios <- split(d, d$estudio)
  if (nzchar(Sys.getenv("SOLO"))) estudios <- estudios[strsplit(Sys.getenv("SOLO"), ",")[[1]]]
  res <- parallel::mclapply(estudios, \(e) try(una_rejilla(e)), mc.cores = NUCLEOS, mc.preschedule = FALSE)
  fallos <- vapply(res, inherits, logical(1), "try-error")
  if (any(fallos)) stop("Fallan: ", paste(names(res)[fallos], collapse = ", "), "\n", res[fallos][[1]])
  orden_cols <- c("estudio", "mes", "base", "votante", "reparto", "alfa")
  est <- purrr::map(res, "est") |> purrr::list_rbind() |> dplyr::relocate(dplyr::all_of(orden_cols)) |>
    arrange(mes, base, votante, reparto, alfa, desc(est))
  info <- purrr::map(res, "info") |> purrr::list_rbind() |> dplyr::relocate(dplyr::all_of(orden_cols)) |>
    arrange(mes, base, votante, reparto, alfa)
  sufijo <- if (nzchar(Sys.getenv("SOLO"))) "_prueba.csv" else ".csv.gz"
  write_csv(est, file.path(SAL, paste0("rejilla", sufijo)))
  write_csv(info, file.path(SAL, paste0("rejilla_info", sufijo)))
  cat(sprintf("Rejilla: %d combinaciones en %d estudios, %.1f min\n",
              nrow(dplyr::distinct(info, base, votante, reparto, alfa)), dplyr::n_distinct(info$estudio),
              as.numeric(difftime(Sys.time(), t0, units = "mins"))))
}
