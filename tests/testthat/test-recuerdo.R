test_that("celda_participacion: el recuerdo manda y la pregunta de participación completa la no respuesta", {
  rec  <- c("PSOE", "NO_VOTO", "NS", "NC", "NR", "NO_TENIA_EDAD", "SIN_DERECHO_VOTO", "NP", NA, "NS")
  part <- c("No votó", "Votó", "Votó", "No votó", "Votó por correo", "Votó", "No votó", "Votó", "Votó", "NS")
  expect_equal(celda_participacion(rec, part),
               c("VOTO", "ABST", "VOTO", "ABST", "VOTO", NA, NA, NA, "VOTO", NA))
})

test_that("celda_participacion avisa de categorías de participación sin clasificar", {
  expect_error(celda_participacion("NS", "Votó dos veces"), "sin clasificar")
})

test_that("celda_recuerdo agrupa por elección de referencia y manda el resto a OTROS", {
  expect_equal(celda_recuerdo(c("PSOE", "PP", "VOX", "SUMAR", "ERC", "NO_VOTO", "NS", NA), "2023-07"),
               c("PSOE", "PP", "VOX", "SUMAR", "OTROS", NA, NA, NA))
  expect_equal(celda_recuerdo(c("UNIDAS_PODEMOS", "EN_COMU_PODEM", "PODEMOS", "CS", "SUMAR"), "2019-11"),
               c("UP", "UP", "UP", "CS", "OTROS"))
})

test_that("objetivos_recuerdo calcula la participación sin CERA y las cuotas sobre votantes", {
  res <- tibble::tibble(eleccion = "2023-07", dato = c("censo_total", "censo_cera", "votantes_total", "votantes_cera", "PP", "PSOE"),
                        valor = c("1000", "100", "720", "20", "300", "250"), fuente = "")
  o <- objetivos_recuerdo(res)[["2023-07"]]
  expect_equal(unname(o$participacion["VOTO"]), 700 / 900)
  expect_equal(sum(o$participacion), 1)
  expect_equal(unname(o$voto[c("PP", "PSOE")]), c(300, 250) / 720)
  expect_equal(unname(o$voto["OTROS"]), 1 - 550 / 720)
})

# muestra sintética: 400 entrevistas, dos sexos, dos grupos de edad, votantes y abstencionistas con recuerdo
muestra <- function(semilla = 1, p_abst = 0.15) {
  set.seed(semilla)
  n <- 400
  tibble::tibble(
    w0 = runif(n, 0.5, 1.5),
    sexo = sample(c("Hombre", "Mujer"), n, TRUE),
    edad = sample(c("18-34", "35-64", "65 y más"), n, TRUE),
    cel_part = sample(c("VOTO", "ABST"), n, TRUE, prob = c(1 - p_abst, p_abst))
  ) |> dplyr::mutate(cel_voto = ifelse(cel_part == "VOTO", sample(c("A", "B", "OTROS"), n, TRUE, prob = c(0.5, 0.3, 0.2)), NA))
}

test_that("rastrillar reproduce los márgenes y conserva las distribuciones sociodemográficas del peso de partida", {
  m <- muestra()
  margenes <- list(list(cel = m$cel_part, obj = c(VOTO = 0.7, ABST = 0.3)),
                   list(cel = m$cel_voto, obj = c(A = 0.4, B = 0.35, OTROS = 0.25)))
  socio <- list(m$sexo, m$edad)
  r <- rastrillar(m$w0, margenes, socio)
  expect_false(is.na(r$iter))
  expect_equal(sum(r$w), sum(m$w0))
  prop <- function(w, cel) { t <- tapply(w, cel, sum); as.vector(t / sum(t)) }   # en orden alfabético de celda
  expect_equal(prop(r$w, m$cel_part), c(0.3, 0.7), tolerance = 1e-5)              # ABST, VOTO
  dentro <- !is.na(m$cel_voto)
  expect_equal(prop(r$w[dentro], m$cel_voto[dentro]), c(0.4, 0.35, 0.25), tolerance = 1e-5)   # A, B, OTROS
  expect_equal(as.vector(tapply(r$w, m$sexo, sum)), as.vector(tapply(m$w0, m$sexo, sum)), tolerance = 1e-5)
  expect_equal(as.vector(tapply(r$w, m$edad, sum)), as.vector(tapply(m$w0, m$edad, sum)), tolerance = 1e-5)
  expect_false(any(r$recortado))
  expect_lt(r$desvio_max, 1e-5)
})

test_that("rastrillar recorta el factor de ajuste cuando el objetivo exige más de RAKING_FACTOR y lo declara", {
  m <- muestra(p_abst = 0.05)
  # 5 % de abstención declarada frente a un 40 % objetivo: el factor necesario (~8) supera la cota de 5
  margenes <- list(list(cel = m$cel_part, obj = c(VOTO = 0.6, ABST = 0.4)))
  r <- rastrillar(m$w0, margenes, list(m$sexo))
  f <- r$w / m$w0
  expect_true(any(r$recortado))
  expect_lte(max(f), RAKING_FACTOR[2] * (1 + 1e-6))
  expect_gte(min(f), RAKING_FACTOR[1] * (1 - 1e-6))
  expect_gt(r$desvio_max, 0.01)   # el margen no se alcanza: el desvío queda declarado
  expect_equal(mean(r$recortado), mean(m$cel_part == "ABST"))
})

test_that("un margen sin ninguna entrevista dentro se ignora sin romper el ajuste", {
  m <- muestra()
  margenes <- list(list(cel = rep(NA_character_, nrow(m)), obj = c(X = 1)))
  r <- rastrillar(m$w0, margenes, list(m$sexo))
  expect_equal(as.vector(r$w), m$w0, tolerance = 1e-8)
})
