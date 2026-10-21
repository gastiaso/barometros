# Pipeline de armonización (R + targets). Ejecutar desde la raíz del proyecto:  Rscript -e 'targets::tar_make()'
# Requiere haber ejecutado antes los scripts de Python (00 a 05): .sav extraídos e inventario revisado.
library(targets)
tar_option_set(packages = c("dplyr", "tidyr", "purrr", "readr", "haven", "arrow", "jsonlite", "tibble"))
tar_source("R")

INV <- "inventario"
PUB <- "datos/publicacion"

list(
  tar_target(f_crosswalk, file.path(INV, "crosswalk_revisado.csv"), format = "file"),
  tar_target(f_estudios, file.path(INV, "estudios.csv"), format = "file"),
  tar_target(f_partidos, file.path(INV, "mapa_partidos.csv"), format = "file"),
  tar_target(f_problemas, file.path(INV, "mapa_problemas.csv"), format = "file"),
  tar_target(f_candidatos, file.path(INV, "mapa_candidatos.csv"), format = "file"),
  tar_target(f_lideres, file.path(INV, "lideres.csv"), format = "file"),
  tar_target(f_rupturas, file.path(INV, "rupturas_candidatas.csv"), format = "file"),
  tar_target(f_conceptos, file.path(INV, "conceptos.csv"), format = "file"),
  tar_target(f_decisiones, file.path(INV, "decisiones_manuales.csv"), format = "file"),
  tar_target(f_sin_etiqueta, file.path(INV, "codigos_sin_etiqueta.csv"), format = "file"),
  tar_target(insumos, cargar_insumos(f_crosswalk, f_estudios, f_partidos, f_problemas, f_candidatos, f_lideres,
                                     f_rupturas, f_conceptos, f_decisiones, f_sin_etiqueta)),
  tar_target(estudio, insumos$estudios$estudio),
  tar_target(f_sav, ruta_sav(estudio), pattern = map(estudio), format = "file"),
  tar_target(lecturas, aplicar_correcciones(purrr::map2(estudio, f_sav, leer_estudio, insumos = insumos))),
  tar_target(canon, canon_cerradas(lecturas, insumos)),
  tar_target(microdatos, unir_estudios(purrr::map(lecturas, armonizar_estudio, canon = canon, insumos = insumos))),
  tar_target(validacion, validar(microdatos, canon)),
  tar_target(f_validacion, escribir_validacion(validacion, INV), format = "file"),
  tar_target(f_parquet, {
    if (!validacion$ok) stop("La validación falla: revisa inventario/validacion_*.csv")
    escribir_parquet(microdatos, file.path(PUB, "microdatos.parquet"))
  }, format = "file"),
  tar_target(f_metadatos, escribir_metadatos(construir_metadatos(microdatos, canon, insumos, lecturas),
                                             file.path(PUB, "metadatos.json")), format = "file")
)
