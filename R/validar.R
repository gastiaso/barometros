# Validación del fichero armonizado: integridad interna y cifras publicadas por el CIS

# Cifras publicadas por el CIS que el fichero debe reproducir (se amplían con cada comprobación)
REFERENCIAS_CIS <- tibble::tribble(
  ~estudio, ~indicador,                    ~valor, ~tolerancia,
  3577L,    "media_ideologia",              4.61,  0.005,
  3582L,    "media_ideologia",              4.51,  0.005,
  3582L,    "pct_ideologia_1",             18.9,   0.05
)

pct_pond <- function(x, w) 100 * sum(w[x], na.rm = TRUE) / sum(w, na.rm = TRUE)

validar <- function(d, canon) {
  categoricas <- names(d)[vapply(d, is.factor, logical(1))]
  sin_mapa <- purrr::map(categoricas, \(k) d |> dplyr::filter(.data[[k]] == "SIN_MAPA") |>
                           dplyr::count(estudio, mes) |> dplyr::mutate(concepto = k)) |> purrr::list_rbind()
  peso_na <- d |> dplyr::filter(is.na(peso)) |> dplyr::count(estudio)
  calc <- d |>
    dplyr::group_by(estudio) |>
    dplyr::summarise(
      media_ideologia = stats::weighted.mean(ideologia, peso, na.rm = TRUE),
      pct_ideologia_1 = pct_pond(ideologia_cat == "1", peso),
      .groups = "drop") |>
    tidyr::pivot_longer(-estudio, names_to = "indicador", values_to = "calculado")
  ext <- dplyr::left_join(REFERENCIAS_CIS, calc, by = c("estudio", "indicador")) |>
    dplyr::mutate(ok = abs(round(calculado, 2) - valor) <= tolerancia)
  # anomalías: proporción de no respuesta muy por encima de la habitual del concepto
  nr <- names(NO_RESPUESTA)
  anom <- purrr::map(setdiff(categoricas, c("mes")), \(k) d |>
                       dplyr::group_by(estudio, mes) |>
                       dplyr::summarise(pnr = mean(.data[[k]] %in% nr), presente = any(!is.na(.data[[k]])), .groups = "drop") |>
                       dplyr::filter(presente) |>
                       dplyr::mutate(concepto = k, mediana = stats::median(pnr))) |>
    purrr::list_rbind() |>
    dplyr::filter(pnr - mediana > 0.15)
  list(sin_mapa = sin_mapa, peso_na = peso_na, externas = ext, anomalias_nr = anom,
       registro_etiquetas = dplyr::filter(canon, registro != ""),
       ok = nrow(sin_mapa) == 0 && nrow(peso_na) == 0 && all(ext$ok))
}

escribir_validacion <- function(v, dir) {
  dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  readr::write_csv(v$externas, file.path(dir, "validacion_cifras_cis.csv"))
  readr::write_csv(v$sin_mapa, file.path(dir, "validacion_sin_mapa.csv"))
  readr::write_csv(v$anomalias_nr, file.path(dir, "validacion_anomalias_no_respuesta.csv"))
  readr::write_csv(v$registro_etiquetas, file.path(dir, "registro_etiquetas_cerradas.csv"))
  file.path(dir, c("validacion_cifras_cis.csv", "validacion_sin_mapa.csv",
                   "validacion_anomalias_no_respuesta.csv", "registro_etiquetas_cerradas.csv"))
}
