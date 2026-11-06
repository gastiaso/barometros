# Márgenes de nivel de estudios para el peso homogéneo (R/pesos.R): proporción de cada nivel dentro de cada celda de
# sexo × grupo de edad. Fuente por defecto: la distribución ponderada de los dos primeros barómetros con ponderación por
# estudios y con la definición de estudios «cursados» (3427 y 3431, noviembre y diciembre de 2023), es decir, la
# estructura educativa de la población que el CIS tomó como referencia en ese momento. Es una aproximación para
# 2021-2023 (la estructura cambia despacio: menos de un punto al año en «Superiores»); si se dispone de los márgenes del
# INE por año, basta sustituir inventario/margenes_estudios.csv (mismas columnas, una fila por celda y nivel) y anotar
# la fuente.
# Uso (desde la raíz, con datos/publicacion/microdatos.parquet ya generado):  Rscript scripts/13_margenes_estudios.R
suppressPackageStartupMessages({ library(dplyr) })
ESTUDIOS_REF <- c(3427L, 3431L)
d <- arrow::read_parquet("datos/publicacion/microdatos.parquet", col_select = c("estudio", "mes", "peso", "sexo", "edad_g", "estudios"))
m <- d |>
  filter(estudio %in% ESTUDIOS_REF, !is.na(sexo), !is.na(edad_g), !is.na(estudios), !estudios %in% c("NS", "NC", "NR", "NP")) |>
  mutate(estudios = as.character(estudios), sexo = as.character(sexo), edad_g = as.character(edad_g)) |>
  group_by(sexo, edad_g, estudios) |> summarise(w = sum(peso), .groups = "drop") |>
  group_by(sexo, edad_g) |> mutate(p = round(w / sum(w), 5)) |> ungroup() |>
  transmute(sexo, edad_g, estudios, p, fuente = sprintf("Barómetros %s (nov-dic 2023), distribución ponderada con PESO", paste(ESTUDIOS_REF, collapse = " y "))) |>
  arrange(sexo, edad_g, estudios)
readr::write_csv(m, "inventario/margenes_estudios.csv")
cat("inventario/margenes_estudios.csv:", nrow(m), "filas;", n_distinct(paste(m$sexo, m$edad_g)), "celdas\n")
print(m |> group_by(estudios) |> summarise(p = round(100 * sum(p) / n_distinct(paste(m$sexo, m$edad_g)), 1)))
