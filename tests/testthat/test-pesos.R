# muestra sintética de dos «estudios»: uno anterior y otro posterior a la ponderación por estudios del CIS
muestra_estudios <- function() {
  set.seed(7)
  n <- 600
  base <- tibble::tibble(
    peso = runif(n, 0.6, 1.4),
    sexo = factor(sample(c("Hombre", "Mujer"), n, TRUE)),
    edad_g = factor(sample(c("18-24", "25-34"), n, TRUE)),
    estudios = factor(sample(c("Primaria", "Secundaria", "Superiores", "NC"), n, TRUE, prob = c(0.2, 0.3, 0.45, 0.05)))
  )
  dplyr::bind_rows(dplyr::mutate(base, estudio = 1L, mes = "2022-05"), dplyr::mutate(base, estudio = 2L, mes = "2024-01"))
}
margenes <- tibble::tibble(sexo = rep(c("Hombre", "Mujer"), each = 6), edad_g = rep(rep(c("18-24", "25-34"), each = 3), 2),
                           estudios = rep(c("Primaria", "Secundaria", "Superiores"), 4), p = rep(c(0.3, 0.45, 0.25), 4))

test_that("ponderar_estudios ajusta los estudios dentro de cada celda de sexo × edad y deja intacto el peso desde nov-2023", {
  d <- ponderar_estudios(muestra_estudios(), margenes)
  expect_true("peso_estudios" %in% names(d))
  post <- d[d$estudio == 2L, ]
  expect_equal(post$peso_estudios, post$peso)
  pre <- d[d$estudio == 1L & d$estudios != "NC", ]
  for (k in split(pre, paste(pre$sexo, pre$edad_g))) {
    p <- tapply(k$peso_estudios, droplevels(k$estudios), sum); p <- p / sum(p)
    expect_equal(as.vector(p[c("Primaria", "Secundaria", "Superiores")]), c(0.3, 0.45, 0.25), tolerance = 1e-5)
  }
  # la distribución de sexo × edad del peso del CIS se conserva (con la no respuesta de estudios dentro)
  pre_t <- d[d$estudio == 1L, ]
  expect_equal(as.vector(tapply(pre_t$peso_estudios, paste(pre_t$sexo, pre_t$edad_g), sum)),
               as.vector(tapply(pre_t$peso, paste(pre_t$sexo, pre_t$edad_g), sum)), tolerance = 1e-5)
  expect_equal(sum(pre_t$peso_estudios), sum(pre_t$peso), tolerance = 1e-6)
  de <- deff_estudios(d)
  expect_equal(nrow(de), 2)
  expect_gt(de$deff_estudios[de$estudio == 1], 1)
  expect_equal(de$factor_max[de$estudio == 2], 1)
  expect_true(all(c("iteraciones", "pct_recortado", "desvio_max") %in% names(de)))
})

test_that("leer_margenes_estudios normaliza las proporciones dentro de cada celda y exige las columnas", {
  f <- tempfile(fileext = ".csv")
  readr::write_csv(dplyr::mutate(margenes, p = p * 100), f)
  m <- leer_margenes_estudios(f)
  expect_equal(as.vector(tapply(m$p, paste(m$sexo, m$edad_g), sum)), rep(1, 4))
  readr::write_csv(dplyr::select(margenes, -p), f)
  expect_error(leer_margenes_estudios(f), "faltan columnas")
})
