# Datos de «Construye tu propia estimación» (web/datos/estimacion.json), a partir de la rejilla ya calculada
# (estimacion/rejilla.csv.gz, estimacion/rejilla_info.csv.gz), de la estimación publicada por el CIS
# (estimacion/estimacion_cis.csv) y de las fichas técnicas del CIS (estimacion/fichas_tecnicas.csv). La rejilla y las
# fichas se recalculan aparte con cada barómetro nuevo (estimacion/rejilla.R, estimacion/fichas_tecnicas.py).
#
# Uso:  Rscript scripts/07_estimacion.R    (desde la raíz, después de scripts/07_web.R)
# En modo veda (VEDA=1) no escribe nada: la sección se retira con el resto de series electorales.

suppressPackageStartupMessages({ library(dplyr); library(readr); library(jsonlite) })

if (identical(Sys.getenv("VEDA"), "1")) { cat("estimacion: modo veda, sin datos\n"); quit(save = "no") }

EST <- "estimacion"
WEB <- "web/datos"
rej <- read_csv(file.path(EST, "rejilla.csv.gz"), col_types = "cccccdcdd", progress = FALSE)
info <- read_csv(file.path(EST, "rejilla_info.csv.gz"), col_types = "cccccdiddl", progress = FALSE)
cis <- read_csv(file.path(EST, "estimacion_cis.csv"), col_types = "ccccdc", progress = FALSE)
meta <- read_json("datos/publicacion/metadatos.json")
fichas <- read_csv(file.path(EST, "fichas_tecnicas.csv"), col_types = cols(.default = "c"), progress = FALSE)

DIMS <- list(
  base = list(list(id = "intencion", t = "Intención directa"), list(id = "simpatia", t = "Voto + simpatía")),
  votante = list(list(id = "todos", t = "Todos los que declaran voto"), list(id = "p8", t = "Probabilidad de votar 8 a 10"),
                 list(id = "p9", t = "Probabilidad de votar 9 o 10"), list(id = "p10", t = "Solo probabilidad 10"),
                 list(id = "pond", t = "Todos, ponderados por su probabilidad")),
  reparto = list(list(id = "ninguno", t = "No se reparten"), list(id = "scr", t = "Simpatía, cercanía, recuerdo"),
                 list(id = "rsc", t = "Recuerdo, simpatía, cercanía"), list(id = "csr", t = "Cercanía, simpatía, recuerdo"),
                 list(id = "s", t = "Solo simpatía"), list(id = "regresion", t = "Regresión")),
  alfa = list(list(id = "0", t = "Ninguna"), list(id = "0.25", t = "Un cuarto"), list(id = "0.5", t = "La mitad"),
              list(id = "1", t = "Completa"))
)
PRESETS <- list(
  M1 = list(base = "simpatia", votante = "todos", reparto = "ninguno", alfa = "0"),
  M2 = list(base = "simpatia", votante = "todos", reparto = "ninguno", alfa = "1"),
  M3 = list(base = "intencion", votante = "p9", reparto = "scr", alfa = "1"),
  M4 = list(base = "intencion", votante = "p9", reparto = "regresion", alfa = "1")
)
ids <- lapply(DIMS, \(x) vapply(x, `[[`, "", "id"))
n_comb <- prod(lengths(ids))
# índice de combinación: ((base·NV + votante)·NR + reparto)·NA + alfa
indice <- function(b, v, r, a) {
  ((match(b, ids$base) - 1) * length(ids$votante) + (match(v, ids$votante) - 1)) * length(ids$reparto) * length(ids$alfa) +
    (match(r, ids$reparto) - 1) * length(ids$alfa) + (match(a, ids$alfa) - 1)
}
rej <- rej |> mutate(alfa = format(alfa, drop0trailing = TRUE, trim = TRUE), k = indice(base, votante, reparto, alfa))
info <- info |> mutate(alfa = format(alfa, drop0trailing = TRUE, trim = TRUE), k = indice(base, votante, reparto, alfa))
stopifnot(!anyNA(rej$k), !anyNA(info$k))

estudios <- bind_rows(lapply(meta$estudios, \(e) tibble(estudio = e$estudio, mes = e$mes, n = e$n,
  campo = paste(e$fecha_campo_inicio, e$fecha_campo_fin, sep = "/")))) |> filter(estudio %in% rej$estudio) |> arrange(mes)
meses <- estudios$mes
pos <- \(mes, k) (match(mes, meses) - 1) * n_comb + k + 1
# partidos: los que llegan al 1 % en alguna combinación, ordenados por su máximo
orden_p <- rej |> group_by(partido) |> summarise(mx = max(est), .groups = "drop") |> filter(mx >= 1) |> arrange(desc(mx))
vector_de <- function(df, col, escala = 10) {
  v <- rep(NA_integer_, length(meses) * n_comb)
  v[pos(df$mes, df$k)] <- as.integer(round(df[[col]] * escala))
  v
}
est <- lapply(setNames(orden_p$partido, orden_p$partido), \(p) vector_de(filter(rej, partido == p), "est"))
me <- lapply(setNames(orden_p$partido, orden_p$partido), \(p) vector_de(filter(rej, partido == p), "me"))
# CIS: misma agrupación de candidaturas que los modelos
agr <- c(EN_COMU_PODEM = "UNIDAS_PODEMOS", EN_COMUN_UP = "UNIDAS_PODEMOS", MES_COMPROMIS = "COMPROMIS", NA_SUMA = "UPN", CCA_NC = "CC")
cis_p <- cis |> mutate(partido = coalesce(unname(agr[partido]), partido)) |> group_by(estudio, mes, partido) |>
  summarise(est = sum(estimacion), .groups = "drop") |> filter(mes %in% meses)
cis_v <- lapply(setNames(unique(cis_p$partido), unique(cis_p$partido)), \(p) {
  x <- filter(cis_p, partido == p); v <- rep(NA_integer_, length(meses)); v[match(x$mes, meses)] <- as.integer(round(x$est * 10)); v
})

# contraste con el 23J: barómetros de junio (3410) y julio de 2023 (3413); el espacio de Sumar se suma como concurrió
ESPACIO_SUMAR <- c("SUMAR", "PODEMOS", "UNIDAS_PODEMOS", "IU", "MAS_PAIS", "COMPROMIS", "MES_COMPROMIS", "EN_COMU_PODEM")
REAL_23J <- c(PP = 33.06, PSOE = 31.68, VOX = 12.38, SUMAR = 12.33)
contraste <- function(df, clave) {
  df |> filter(estudio %in% c("3410", "3413")) |>
    mutate(partido = ifelse(partido %in% ESPACIO_SUMAR, "SUMAR", partido)) |>
    group_by(estudio, across(all_of(clave)), partido) |> summarise(est = sum(est), .groups = "drop") |>
    filter(partido %in% names(REAL_23J)) |> mutate(error = est - REAL_23J[partido]) |>
    group_by(estudio, across(all_of(clave))) |>
    summarise(medio = round(mean(abs(error)), 3),
              ventaja = round((est[partido == "PP"] - est[partido == "PSOE"]) - (REAL_23J[["PP"]] - REAL_23J[["PSOE"]]), 3),
              .groups = "drop")
}
c_rej <- contraste(rej, "k")
c_cis <- contraste(transmute(cis_p, estudio, mes, partido, est), "mes")
c23 <- lapply(c("3410", "3413"), \(s) {
  x <- filter(c_rej, estudio == s); m <- rep(NA_real_, n_comb); v <- m
  m[x$k + 1] <- x$medio; v[x$k + 1] <- x$ventaja
  y <- filter(c_cis, estudio == s)
  list(estudio = s, mes = estudios$mes[estudios$estudio == s], medio = m, ventaja = v,
       cis = list(medio = y$medio, ventaja = y$ventaja))
})

# nombres de las candidaturas, de las preguntas de voto de los metadatos
etiquetas <- list()
for (c in c("intencion_voto_r", "voto_simpatia", "intencion_voto")) for (x in meta$conceptos[[c]]$categorias)
  if (is.null(etiquetas[[x$id]])) etiquetas[[x$id]] <- x$etiqueta
etiquetas <- etiquetas[intersect(names(etiquetas), orden_p$partido)]

# error de cada combinación en las encuestas anteriores a cinco generales (estimacion/historico_rejilla.R)
historico <- NULL
if (file.exists(file.path(EST, "historico_rejilla.csv"))) {
  hr <- read_csv(file.path(EST, "historico_rejilla.csv"), col_types = "ccccccddd", progress = FALSE) |>
    mutate(alfa = format(as.numeric(alfa), drop0trailing = TRUE, trim = TRUE), k = indice(base, votante, reparto, alfa))
  stopifnot(!anyNA(hr$k))
  porcomb <- hr |> group_by(k) |> summarise(medio = mean(error_medio), ventaja = mean(abs(error_ventaja)), n = n(), .groups = "drop")
  vec <- function(df, col) { v <- rep(NA_real_, n_comb); v[df$k + 1] <- round(df[[col]], 3); v }
  NOMBRES <- c("2015-12" = "20D-2015", "2016-06" = "26J-2016", "2019-04" = "28A-2019", "2019-11" = "10N-2019", "2023-07" = "23J-2023")
  por_el <- lapply(names(NOMBRES), \(el) {
    x <- hr |> filter(eleccion == el) |> group_by(k) |> summarise(medio = mean(error_medio), .groups = "drop")
    list(eleccion = NOMBRES[[el]], encuestas = n_distinct(hr$estudio[hr$eleccion == el]), medio = vec(x, "medio"))
  })
  historico <- list(encuestas = n_distinct(hr$estudio), medio = vec(porcomb, "medio"), ventaja = vec(porcomb, "ventaja"),
                    elecciones = por_el)
}

salida <- list(
  generado = format(Sys.Date()),
  dims = DIMS, presets = PRESETS, n_comb = n_comb,
  meses = meses, estudios = estudios$estudio, n = estudios$n, campo = estudios$campo,
  hay_prob = info$hay_prob[match(estudios$estudio, info$estudio)],
  partidos = orden_p$partido, etiquetas = etiquetas,
  est = est, me = me,
  fuera = vector_de(distinct(info, mes, k, .keep_all = TRUE), "fuera"),
  n_efectivo = vector_de(distinct(info, mes, k, .keep_all = TRUE), "n_efectivo", 1),
  cis = cis_v,
  # ficha técnica del CIS de cada barómetro (estimacion/fichas_tecnicas.py)
  ficha = lapply(estudios$estudio, \(s) { f <- fichas[fichas$estudio == s, ]; if (!nrow(f)) NULL else as.list(f[1, -1]) }),
  contraste_23j = list(real = as.list(REAL_23J), estudios = c23),
  historico = historico
)
write_json(salida, file.path(WEB, "estimacion.json"), auto_unbox = TRUE, na = "null", digits = NA)
cat(sprintf("estimacion: %d meses × %d combinaciones, %d partidos, %.1f MB\n", length(meses), n_comb, nrow(orden_p),
            file.size(file.path(WEB, "estimacion.json")) / 1e6))
