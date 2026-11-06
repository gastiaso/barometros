# Pruebas unitarias de las funciones de armonización (R/). Ejecutar desde la raíz: Rscript tests/testthat.R
suppressPackageStartupMessages({ library(testthat); library(dplyr) })
for (f in list.files("R", pattern = "\\.R$", full.names = TRUE)) source(f, encoding = "UTF-8")
test_dir("tests/testthat", reporter = "summary", stop_on_failure = TRUE)
