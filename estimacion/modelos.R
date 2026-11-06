# Los cuatro modelos de referencia de «Construye tu estimación» (M1-M4), con intervalos por remuestreo, y contraste con
# el resultado de las generales del 23 de julio de 2023. Sirve para comprobar el margen aproximado de la rejilla
# (estimacion/rejilla.R), que reproduce estos cuatro modelos. Sus definiciones las usa también la rejilla.
#
# Uso (desde la raíz, después de targets::tar_make()):
#   Rscript estimacion/modelos.R            B=100 remuestreos en M1-M3 y B4=25 en M4 (variables de entorno)
#
# Modelos (todos en % sobre voto válido = partidos + en blanco):
#   M1  Voto + simpatía con el peso del CIS.
#   M2  M1 con los pesos reponderados por recuerdo de voto (peso_recuerdo).
#   M3  Votantes probables + cascada para los indecisos, con peso_recuerdo:
#       - votante probable: probabilidad de ir a votar 9 o 10 (desde sep-2022); antes, quien no dice que no votaría;
#       - voto: intención directa; si no sabe o no contesta, voto + simpatía; si no, partido más cercano; si no,
#         recuerdo de voto (solo si ese partido se ofrece en el barómetro); si nada, queda fuera.
#   M4  Votantes probables como M3; los indecisos se reparten con una regresión logística multinomial ajustada
#       en el mismo barómetro sobre quienes declaran voto (ideología, recuerdo, valoración de líderes, sexo, edad).

suppressPackageStartupMessages({ library(arrow); library(dplyr); library(tidyr); library(purrr); library(readr); library(nnet) })
set.seed(20261022)
B <- as.integer(Sys.getenv("B", "100"))
B4 <- as.integer(Sys.getenv("B4", "25"))
NUCLEOS <- max(1L, parallel::detectCores())
SAL <- "estimacion"

d <- read_parquet("datos/publicacion/microdatos.parquet") |>
  select(estudio, mes, peso, peso_recuerdo, intencion_voto, voto_simpatia, cercania, recuerdo_voto, prob_votar,
         ideologia, sexo, edad_g, starts_with("lider_")) |>
  mutate(across(where(is.factor), as.character), estudio = as.character(estudio))

# Candidaturas: las marcas que concurren juntas se suman según el periodo, como hace el CIS en su estimación.
# - Hasta mar-2023: Podemos e IU dentro de Unidas Podemos.
# - Abr y may-2023: Podemos dentro de Unidas Podemos; IU, Más País y Compromís dentro de Sumar (como el CIS y VOTOSIMG).
# - Jun a dic-2023 (23J y hasta la salida de Podemos del grupo): Podemos, Unidas Podemos, IU, Más País y Compromís dentro de Sumar.
# - Desde ene-2024: IU, Más País y Compromís dentro de Sumar; Podemos por separado.
# - Comuns Sumar y, desde oct-2026, Frente Amplio, dentro de Sumar (el CIS publica «SUMAR / Frente Amplio»).
agrupar <- function(x, mes) {
  x <- dplyr::recode(x, EN_COMU_PODEM = "UNIDAS_PODEMOS", EN_COMUN_UP = "UNIDAS_PODEMOS", MES_COMPROMIS = "COMPROMIS",
                     NA_SUMA = "UPN", CCA_NC = "CC")
  antes <- mes < "2023-04"; j23 <- mes >= "2023-06" & mes <= "2023-12"; despues <- mes >= "2024-01"
  x[antes & x %in% c("PODEMOS", "IU")] <- "UNIDAS_PODEMOS"
  primavera <- mes >= "2023-04" & mes <= "2023-05"
  x[primavera & x %in% "PODEMOS"] <- "UNIDAS_PODEMOS"
  x[primavera & x %in% c("IU", "MAS_PAIS", "COMPROMIS")] <- "SUMAR"
  x[j23 & x %in% c("PODEMOS", "UNIDAS_PODEMOS", "IU", "MAS_PAIS", "COMPROMIS")] <- "SUMAR"
  x[despues & x %in% c("IU", "MAS_PAIS", "COMPROMIS")] <- "SUMAR"
  x[despues & x %in% "UNIDAS_PODEMOS"] <- "PODEMOS"
  x[x %in% c("COMUNS_SUMAR", "FRENTE_AMPLIO")] <- "SUMAR"
  x
}
d <- d |> mutate(across(c(intencion_voto, voto_simpatia, cercania, recuerdo_voto), \(x) agrupar(x, mes)))

NO_VALIDO <- c("NULO", "NO_VOTARIA", "NO_VOTA_NINGUNO", "NINGUNO", "NS", "NC", "NR", "NP", "SIN_MAPA", "NO_VOTO",
               "NO_TENIA_EDAD", "SIN_DERECHO_VOTO", "SIN_DERECHO")
valido <- function(x) !is.na(x) & !(x %in% NO_VALIDO)
indeciso <- function(x) !is.na(x) & x %in% c("NS", "NC")
# variantes territoriales del recuerdo que corresponden a una candidatura de la intención
RECUERDO_A_INTENCION <- c(EN_COMU_PODEM = "UNIDAS_PODEMOS", EN_COMUN_UP = "UNIDAS_PODEMOS", NA_SUMA = "UPN",
                          MES_COMPROMIS = "COMPROMIS", CCA_NC = "CC")

reparto <- function(x, w) {                       # % sobre voto válido de una variable de voto
  ok <- valido(x)
  s <- tapply(w[ok], x[ok], sum)
  100 * s / sum(s)
}

# ---------------------------------------------------------------- votantes probables y cascada (M3)
votante_probable <- function(e) {
  if (all(is.na(e$prob_votar))) return(!(e$intencion_voto %in% "NO_VOTARIA"))
  ok <- !is.na(e$prob_votar) & e$prob_votar >= 9
  sin_dato <- is.na(e$prob_votar) & valido(e$intencion_voto)       # no sabe/no contesta la escala pero declara voto
  (ok | sin_dato) & !(e$intencion_voto %in% "NO_VOTARIA")
}
cascada <- function(e) {
  ofrecidos <- unique(e$intencion_voto[valido(e$intencion_voto)])
  rec <- dplyr::coalesce(unname(RECUERDO_A_INTENCION[e$recuerdo_voto]), e$recuerdo_voto)
  rec[!(rec %in% ofrecidos)] <- NA
  v <- ifelse(valido(e$intencion_voto), e$intencion_voto, NA)
  und <- indeciso(e$intencion_voto)
  for (alt in list(e$voto_simpatia, e$cercania, rec)) {
    usar <- und & is.na(v) & valido(alt)
    v[usar] <- alt[usar]
  }
  v
}

# ---------------------------------------------------------------- imputación por regresión (M4)
LIDER_MIN <- 0.5
diseno <- function(e, lideres) {
  ideo <- e$ideologia
  x <- data.frame(ideo = ifelse(is.na(ideo), mean(ideo, na.rm = TRUE), ideo), ideo_na = as.numeric(is.na(ideo)),
                  sexo = factor(dplyr::coalesce(e$sexo, "NC")), edad = factor(dplyr::coalesce(e$edad_g, "NC")))
  rec <- dplyr::coalesce(unname(RECUERDO_A_INTENCION[e$recuerdo_voto]), e$recuerdo_voto, "NC")
  frec <- table(rec)
  x$rec <- factor(ifelse(rec %in% names(frec)[frec >= 30], rec, "OTRO_REC"))
  for (l in lideres) {
    v <- e[[l]]
    x[[l]] <- ifelse(is.na(v), mean(v, na.rm = TRUE), v)
    x[[paste0(l, "_na")]] <- as.numeric(is.na(v))
  }
  x
}
modelo4 <- function(e, w) {
  vp <- votante_probable(e)
  dec <- vp & valido(e$intencion_voto)
  und <- vp & indeciso(e$intencion_voto)
  lideres <- grep("^lider_", names(e), value = TRUE)
  lideres <- lideres[vapply(lideres, \(l) mean(!is.na(e[[l]])) >= LIDER_MIN, logical(1))]
  X <- diseno(e, lideres)
  y <- e$intencion_voto
  frec <- table(y[dec])
  clases <- names(frec)[frec >= 25]
  yc <- ifelse(y %in% clases, y, "RESTO")
  ajuste <- nnet::multinom(factor(yc[dec]) ~ ., data = X[dec, , drop = FALSE], weights = w[dec] / mean(w[dec]),
                           trace = FALSE, maxit = 300, decay = 0.01, MaxNWts = 5000)
  p <- predict(ajuste, newdata = X[und, , drop = FALSE], type = "probs")
  if (is.null(dim(p))) p <- matrix(p, nrow = sum(und), dimnames = list(NULL, ajuste$lev))
  # votos declarados + votos imputados (fraccionarios); «RESTO» se reparte como entre los decididos
  tot <- tapply(w[dec], y[dec], sum)
  imp <- colSums(p * w[und])
  resto <- setdiff(names(tot), clases)
  if ("RESTO" %in% names(imp) && length(resto)) {
    tot[resto] <- tot[resto] + imp[["RESTO"]] * tot[resto] / sum(tot[resto])
  }
  comunes <- intersect(names(imp), clases)
  tot[comunes] <- tot[comunes] + imp[comunes]
  100 * tot / sum(tot)
}

# ---------------------------------------------------------------- estimaciones de un estudio
estimar <- function(e, con_m4 = TRUE) {
  vp <- votante_probable(e)
  m3 <- cascada(e)
  out <- list(
    M1 = reparto(e$voto_simpatia, e$peso),
    M2 = reparto(e$voto_simpatia, e$peso_recuerdo),
    M3 = reparto(ifelse(vp, m3, NA), e$peso_recuerdo)
  )
  if (con_m4) out$M4 <- tryCatch(modelo4(e, e$peso_recuerdo), error = function(err) NULL)
  out
}
largo <- function(lst) purrr::imap(lst, \(v, m) if (is.null(v)) NULL else tibble::tibble(modelo = m, partido = names(v), est = as.numeric(v))) |>
  purrr::list_rbind()

por_estudio <- function(e) {
  pt <- largo(estimar(e))
  idx <- function() sample.int(nrow(e), nrow(e), replace = TRUE)
  bs <- purrr::map(seq_len(B), \(b) largo(estimar(e[idx(), ], con_m4 = FALSE)) |> mutate(b = b)) |> purrr::list_rbind()
  bs4 <- purrr::map(seq_len(B4), \(b) { r <- estimar(e[idx(), ], con_m4 = TRUE)$M4; if (is.null(r)) NULL else tibble::tibble(modelo = "M4", partido = names(r), est = as.numeric(r), b = b) }) |>
    purrr::list_rbind()
  iv <- dplyr::bind_rows(bs, bs4) |>
    tidyr::complete(tidyr::nesting(modelo, b), partido, fill = list(est = 0)) |>
    dplyr::group_by(modelo, partido) |>
    dplyr::summarise(lo = stats::quantile(est, .025), hi = stats::quantile(est, .975), .groups = "drop")
  vp <- votante_probable(e)
  info <- tibble::tibble(
    n = nrow(e),
    filtro = if (all(is.na(e$prob_votar))) "sin pregunta de probabilidad" else "probabilidad 9-10",
    votantes_probables = round(100 * sum(e$peso_recuerdo[vp]) / sum(e$peso_recuerdo), 1),
    indecisos_votantes = round(100 * sum(e$peso_recuerdo[vp & indeciso(e$intencion_voto)]) / sum(e$peso_recuerdo[vp]), 1),
    sin_asignar_m3 = round(100 * sum(e$peso_recuerdo[vp & is.na(cascada(e)) & indeciso(e$intencion_voto)]) / sum(e$peso_recuerdo[vp]), 1)
  )
  list(est = dplyr::left_join(pt, iv, by = c("modelo", "partido")) |> mutate(estudio = e$estudio[1], mes = e$mes[1]),
       info = info |> mutate(estudio = e$estudio[1], mes = e$mes[1]))
}

t0 <- Sys.time()
res <- parallel::mclapply(split(d, d$estudio), por_estudio, mc.cores = NUCLEOS, mc.preschedule = FALSE)
fallos <- vapply(res, inherits, logical(1), "try-error")
if (any(fallos)) stop("Fallan: ", paste(names(res)[fallos], collapse = ", "), "\n", res[fallos][[1]])
estim <- purrr::map(res, "est") |> purrr::list_rbind() |> arrange(mes, modelo, desc(est))
info <- purrr::map(res, "info") |> purrr::list_rbind() |> arrange(mes)
write_csv(estim, file.path(SAL, "resultados_modelos.csv"))
write_csv(info, file.path(SAL, "participacion_indecisos.csv"))
cat(sprintf("Modelos: %d estudios en %.1f min\n", n_distinct(estim$estudio), as.numeric(difftime(Sys.time(), t0, units = "mins"))))

# ---------------------------------------------------------------- contraste con el 23J
# Sumar se presentó con Podemos, IU, Más País, Compromís y En Comú: en la encuesta, esas respuestas se suman a Sumar.
ESPACIO_SUMAR <- c("SUMAR", "PODEMOS", "UNIDAS_PODEMOS", "IU", "MAS_PAIS", "COMPROMIS", "MES_COMPROMIS", "EN_COMU_PODEM")
real <- tibble::tribble(~partido, ~real,
  "PP", 33.06, "PSOE", 31.68, "VOX", 12.38, "SUMAR", 12.33, "ERC", 1.89, "JUNTS", 1.60, "EH_BILDU", 1.36, "PNV", 1.12,
  "BNG", 0.62, "BLANCO", 0.81)
cis <- read_csv(file.path(SAL, "estimacion_cis.csv"), col_types = "ccccdc") |>
  transmute(estudio, mes, modelo = "CIS", partido, est = estimacion)
contraste <- dplyr::bind_rows(estim |> select(estudio, mes, modelo, partido, est), cis) |>
  filter(estudio %in% c("3410", "3413")) |>
  mutate(partido = ifelse(partido %in% ESPACIO_SUMAR, "SUMAR", partido)) |>
  group_by(estudio, mes, modelo, partido) |> summarise(est = sum(est), .groups = "drop") |>
  inner_join(real, by = "partido") |>
  mutate(error = est - real)
resumen <- contraste |>
  group_by(estudio, mes, modelo) |>
  summarise(error_medio_4 = mean(abs(error[partido %in% c("PP", "PSOE", "VOX", "SUMAR")])),
            error_ventaja_pp_psoe = (est[partido == "PP"] - est[partido == "PSOE"]) - (33.06 - 31.68),
            .groups = "drop")
write_csv(contraste, file.path(SAL, "contraste_23J.csv"))
write_csv(resumen, file.path(SAL, "contraste_23J_resumen.csv"))
print(resumen, n = 20)
