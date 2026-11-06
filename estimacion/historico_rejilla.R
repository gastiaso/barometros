# Error de cada combinación de supuestos de «Construye tu estimación» en las encuestas del CIS anteriores a cinco
# generales: 20D-2015, 26J-2016, 28A-2019, 10N-2019 y 23J-2023 (13 encuestas).
#
# - Estudios nuevos (estimacion/historico.parquet, de estimacion/historico_armonizar.py): se reponderan por recuerdo como
#   la serie principal (R/recuerdo.R: participación y reparto entre partidos, conservando sexo, edad y estudios), con el
#   recuerdo de las generales anteriores a cada una, y se calcula la rejilla con la misma función que los barómetros
#   (estimacion/rejilla.R).
# - 23J: se añaden los barómetros de junio y julio de 2023 (3410, 3413) de la rejilla principal.
# - Resultados: estimacion/resultados_historicos.csv (2011 a abr-2019; el voto exterior de 2011, 2015 y 2016 es
#   aproximado y va marcado) e inventario/resultados_electorales.csv (nov-2019).
# Uso (desde la raíz, después de estimacion/rejilla.R):  Rscript estimacion/historico_rejilla.R
# Salidas: estimacion/historico_rejilla.csv (error por encuesta y combinación) y estimacion/historico_resumen.csv.

lineas <- readLines("estimacion/rejilla.R")
eval(parse(text = lineas[1:(grep("^if \\(sys.nframe", lineas) - 1)]))   # definiciones de modelos.R y de la rejilla
source("R/recuerdo.R")

# celdas del recuerdo, con los códigos de historico_armonizar.py (agrupados como en la elección recordada)
CELDAS_RECUERDO <- list(
  "2011-11" = c(PP = "PP", PSOE = "PSOE", IU = "IU", UPYD = "UPYD"),
  "2015-12" = c(PP = "PP", PSOE = "PSOE", PODEMOS = "PODEMOS", CS = "CS", IU = "IU"),
  "2016-06" = c(PP = "PP", PSOE = "PSOE", UP = "UP", CS = "CS"),
  "2019-04" = c(PSOE = "PSOE", PP = "PP", CS = "CS", UP = "UP", VOX = "VOX"),
  "2019-11" = c(PSOE = "PSOE", PP = "PP", VOX = "VOX", UP = "UP", CS = "CS")
)
DATOS_OBJ <- c("censo_total", "censo_cera", "votantes_total", "votantes_cera")
res_hist <- read_csv("estimacion/resultados_historicos.csv", col_types = "cccc", progress = FALSE) |>
  bind_rows(read_csv("inventario/resultados_electorales.csv", col_types = "cccc", progress = FALSE) |> filter(eleccion == "2019-11")) |>
  filter(dato %in% DATOS_OBJ | purrr::map2_lgl(eleccion, dato, \(el, x) x %in% unname(CELDAS_RECUERDO[[el]])))
obj <- objetivos_recuerdo(res_hist)

h <- read_parquet("estimacion/historico.parquet") |> mutate(across(where(is.factor), as.character))
h$peso_recuerdo <- h$peso
for (e in unique(h$estudio)) {
  i <- which(h$estudio == e)
  ref <- h$ref[i[1]]
  margenes <- list(
    list(cel = celda_participacion(h$recuerdo_original[i], h$participacion_g[i]), obj = obj[[ref]]$participacion),
    list(cel = celda_recuerdo(h$recuerdo_celda[i], ref), obj = obj[[ref]]$voto)
  )
  socio <- lapply(MARGENES_SOCIO, \(v) { x <- as.character(h[[v]][i]); x[is.na(x)] <- "NA"; x })
  h$peso_recuerdo[i] <- rastrillar(h$peso[i], margenes, socio)$w
}
print(h |> group_by(estudio, ref) |> summarise(factor_max = round(max(peso_recuerdo / peso), 2),
  deff = round(n() * sum(peso_recuerdo^2) / sum(peso_recuerdo)^2, 2), .groups = "drop"))

t0 <- Sys.time()
res <- parallel::mclapply(split(h, h$estudio), \(e) try(una_rejilla(e)), mc.cores = NUCLEOS, mc.preschedule = FALSE)
fallos <- vapply(res, inherits, logical(1), "try-error")
if (any(fallos)) stop("Fallan: ", paste(names(res)[fallos], collapse = ", "), "\n", res[fallos][[1]])
est_h <- purrr::map(res, "est") |> purrr::list_rbind()
cat(sprintf("Rejilla histórica: %d estudios en %.1f min\n", n_distinct(est_h$estudio), as.numeric(difftime(Sys.time(), t0, units = "mins"))))

# ---------------------------------------------------------------- contraste
ELECCIONES <- tibble::tribble(
  ~eleccion, ~partido, ~real,
  "2015-12", "PP", 28.71, "2015-12", "PSOE", 22.00, "2015-12", "PODEMOS", 20.68, "2015-12", "CS", 13.94, "2015-12", "IU", 3.68,
  "2016-06", "PP", 33.01, "2016-06", "PSOE", 22.63, "2016-06", "UP", 21.15, "2016-06", "CS", 13.06,
  "2019-04", "PSOE", 28.67, "2019-04", "PP", 16.69, "2019-04", "CS", 15.86, "2019-04", "UP", 14.32, "2019-04", "VOX", 10.26,
  "2019-11", "PSOE", 28.00, "2019-11", "PP", 20.81, "2019-11", "VOX", 15.08, "2019-11", "UP", 12.86, "2019-11", "CS", 6.80, "2019-11", "MAS_PAIS", 2.40,
  "2023-07", "PP", 33.06, "2023-07", "PSOE", 31.68, "2023-07", "VOX", 12.38, "2023-07", "SUMAR", 12.33
)
ESPACIO_SUMAR <- c("SUMAR", "PODEMOS", "UNIDAS_PODEMOS", "IU", "MAS_PAIS", "COMPROMIS", "MES_COMPROMIS", "EN_COMU_PODEM")
clave <- c("base", "votante", "reparto", "alfa")
eleccion_de <- h |> distinct(estudio, eleccion) |> bind_rows(tibble::tibble(estudio = c("3410", "3413"), eleccion = "2023-07"))
serie <- read_csv("estimacion/rejilla.csv.gz", col_types = "cccccdcdd", progress = FALSE) |> filter(estudio %in% c("3410", "3413"))
todo <- bind_rows(est_h |> select(estudio, mes, all_of(clave), partido, est), serie |> select(estudio, mes, all_of(clave), partido, est)) |>
  left_join(eleccion_de, by = "estudio") |>
  mutate(partido = ifelse(eleccion == "2023-07" & partido %in% ESPACIO_SUMAR, "SUMAR", partido)) |>
  group_by(eleccion, estudio, mes, across(all_of(clave)), partido) |> summarise(est = sum(est), .groups = "drop")
ventaja <- function(est, real) { o <- order(-real); est[o[1]] - est[o[2]] - (real[o[1]] - real[o[2]]) }   # ganador menos segundo
errores <- todo |> inner_join(ELECCIONES, by = c("eleccion", "partido")) |>
  group_by(eleccion, estudio, mes, across(all_of(clave))) |>
  summarise(n_partidos = n(), error_medio = round(mean(abs(est - real)), 3), error_ventaja = round(ventaja(est, real), 3),
            .groups = "drop")
stopifnot(all(errores$n_partidos == table(ELECCIONES$eleccion)[errores$eleccion]))
resumen <- errores |> group_by(across(all_of(clave))) |>
  summarise(encuestas = n(), error_medio = round(mean(error_medio), 3), error_ventaja_abs = round(mean(abs(error_ventaja)), 3),
            .groups = "drop") |> arrange(error_medio)
write_csv(errores |> select(-n_partidos), "estimacion/historico_rejilla.csv")
write_csv(resumen, "estimacion/historico_resumen.csv")

options(width = 160)
cat("\nLas diez combinaciones con menos error medio en las", max(resumen$encuestas), "encuestas:\n")
print(head(resumen, 10))
cat("\nY las diez con más:\n"); print(tail(resumen, 10))
atajos <- tibble::tribble(~atajo, ~base, ~votante, ~reparto, ~alfa,
  "M1", "simpatia", "todos", "ninguno", 0, "M2", "simpatia", "todos", "ninguno", 1,
  "M3", "intencion", "p9", "scr", 1, "M4", "intencion", "p9", "regresion", 1)
cat("\nAtajos:\n"); print(atajos |> left_join(resumen, by = clave) |> mutate(puesto = match(error_medio, resumen$error_medio)))
cat("\nError medio por opción de cada supuesto:\n")
for (k in clave) print(resumen |> group_by(.data[[k]]) |> summarise(error_medio = round(mean(error_medio), 2), ventaja_abs = round(mean(error_ventaja_abs), 2)))
