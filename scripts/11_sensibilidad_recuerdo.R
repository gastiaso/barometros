# Sensibilidad de la reponderación por recuerdo: la variante «solo votantes» (la anterior a oct-2026: un solo margen
# con abstención y partidos entre quienes recuerdan su voto o declaran no haber votado; NS/NC/NR fuera del margen)
# frente al raking actual (participación sobre todos los que podían votar y partidos entre quienes recuerdan).
# Escribe inventario/sensibilidad_recuerdo.csv: por estudio y partido, intención directa recodificada con el peso del
# CIS, con el raking actual y con la variante, y la diferencia. No publica un segundo peso.
# Uso (desde la raíz, después de targets::tar_make()):  Rscript scripts/11_sensibilidad_recuerdo.R
suppressPackageStartupMessages({ library(dplyr); library(tidyr) })
for (f in list.files("R", full.names = TRUE)) source(f, encoding = "UTF-8")
targets::tar_load(microdatos); d <- microdatos
res <- readr::read_csv("inventario/resultados_electorales.csv", col_types = "cccc")
obj <- objetivos_recuerdo(res)
# variante «solo votantes» (la anterior a oct-2026): un solo margen con abstención y partidos entre quienes recuerdan
# su voto o declaran no haber votado; NS/NC/NR quedan fuera del margen
d$peso_votantes <- d$peso
diag <- list()
for (e in unique(d$estudio)) {
  i <- which(d$estudio == e)
  el <- if (d$mes[i[1]] >= "2023-09") "2023-07" else "2019-11"
  rec <- as.character(d$recuerdo_voto[i])
  cel <- ifelse(rec %in% "NO_VOTO", "ABST", celda_recuerdo(rec, el))
  part <- obj[[el]]$participacion[["VOTO"]]
  objetivo <- c(ABST = 1 - part, obj[[el]]$voto * part)
  socio <- lapply(MARGENES_SOCIO, \(v) { x <- as.character(d[[v]][i]); x[is.na(x)] <- "NA"; x })
  r <- rastrillar(d$peso[i], list(list(cel = cel, obj = objetivo)), socio)
  d$peso_votantes[i] <- r$w
}
pct <- function(x, w, ids) { ok <- !is.na(x) & x != "NP"; sapply(ids, \(k) 100 * sum(w[ok & x == k]) / sum(w[ok])) }
ids <- c("PSOE", "PP", "VOX", "SUMAR", "UNIDAS_PODEMOS", "NO_VOTARIA", "NS")
out <- d |> group_by(estudio, mes) |> group_modify(\(x, k) {
  v <- as.character(x$intencion_voto_r)
  tibble(partido = ids, cis = pct(v, x$peso, ids), recuerdo = pct(v, x$peso_recuerdo, ids), solo_votantes = pct(v, x$peso_votantes, ids))
}) |> ungroup() |> filter(!(cis == 0 & recuerdo == 0 & solo_votantes == 0)) |>
  mutate(across(c(cis, recuerdo, solo_votantes), \(x) round(x, 2)), dif = round(solo_votantes - recuerdo, 2))
readr::write_csv(out, "inventario/sensibilidad_recuerdo.csv")
cat("\nDiferencia (solo votantes − raking actual), puntos de intención directa, por partido:\n")
print(out |> group_by(partido) |> summarise(media = round(mean(dif), 2), abs_media = round(mean(abs(dif)), 2), max_abs = round(max(abs(dif)), 2), meses_mas_1 = sum(abs(dif) > 1), n = n()))
cat("\nAbstención reponderada sobre el total (quien podía votar): raking actual vs solo votantes\n")
ab <- d |> group_by(estudio, mes) |> summarise(actual = 100 * sum(peso_recuerdo[recuerdo_voto %in% "NO_VOTO"]) / sum(peso_recuerdo[!recuerdo_voto %in% c(SIN_DERECHO, NA)]), votantes = 100 * sum(peso_votantes[recuerdo_voto %in% "NO_VOTO"]) / sum(peso_votantes[!recuerdo_voto %in% c(SIN_DERECHO, NA)]), .groups = "drop")
print(summary(ab[, c("actual", "votantes")]))
print(out |> filter(partido %in% c("PSOE", "PP"), abs(dif) > 1) |> select(mes, partido, cis, recuerdo, solo_votantes, dif), n = 30)
