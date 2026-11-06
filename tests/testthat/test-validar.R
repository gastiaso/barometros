test_that("calcular_referencia da porcentajes ponderados sin «no procede», medias y sumas de categorías (A+B)", {
  d <- tibble::tibble(estudio = c(1L, 1L, 1L, 1L, 2L), peso = c(1, 1, 2, 1, 1),
                      intencion_voto_r = factor(c("PSOE", "PP", "NP", "MAS_PAIS", "PSOE")), ideologia = c(2, 4, NA, 6, 8))
  expect_equal(calcular_referencia(d, "1", "pct:intencion_voto_r:PSOE"), 100 / 3)
  expect_equal(calcular_referencia(d, "1", "pct:intencion_voto_r:PSOE+MAS_PAIS"), 200 / 3)
  expect_equal(calcular_referencia(d, "1", "pct:intencion_voto_r:PSOE+INEXISTENTE"), 100 / 3)
  expect_equal(calcular_referencia(d, "1", "media:ideologia"), 4)
  expect_equal(calcular_referencia(d, "2", "pct:intencion_voto_r:PSOE"), 100)
})
