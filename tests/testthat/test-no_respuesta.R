test_that("norm_etiqueta quita tildes, signos y mayúsculas", {
  expect_equal(norm_etiqueta("  La CRISIS económica, los problemas de índole económica  "), "la crisis economica los problemas de indole economica")
  expect_equal(norm_etiqueta("N.S."), "n s")
  expect_true(is.na(norm_etiqueta(NA)))
})

test_that("tipo_no_respuesta distingue NS, NC, NR y NP por etiqueta", {
  expect_equal(tipo_no_respuesta(c("N.S.", "No sabe", "N.C.", "No contesta", "N.R.", "No recuerda", "N.P.", "No procede"), rep(98, 8)),
               c("NS", "NS", "NC", "NC", "NR", "NR", "NP", "NP"))
})

test_that("los códigos 0 y -99 son siempre no procede, aunque el CIS los etiquete N.C. (3502, INTENCIONGALTER)", {
  expect_equal(tipo_no_respuesta(c("N.C.", "N.C.", "N.S."), c(0, -99, 99)), c("NP", "NP", "NS"))
})

test_that("una etiqueta de no respuesta no reconocida cuenta como NC y una vacía también", {
  expect_equal(tipo_no_respuesta(c("Sin respuesta", NA), c(99, 99)), c("NC", "NC"))
})

test_that("relacionadas reconoce la misma categoría con otra redacción", {
  expect_true(relacionadas("La vivienda", "la vivienda"))
  expect_true(relacionadas("La vivienda", "La vivienda y el acceso a ella"))        # truncada
  expect_true(relacionadas("Problemas de índole económica", "Índole económica, problemas de"))  # mismas palabras
  expect_true(relacionadas("Las pensiones", "Las pensiones."))
  expect_false(relacionadas("La vivienda", "La sanidad"))
})
