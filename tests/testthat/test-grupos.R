test_that("grupo_ocupacion agrupa las categorías del CNO-11 del CIS y respeta la no respuesta", {
  x <- c("Directores y gerentes", "Profesionales científicos e intelectuales", "Técnicos y profesionales de apoyo",
         "Personal de apoyo administrativo", "Trabajadores/as de los servicios de restauración, personales, protección y vendedores",
         "Agricultores y trabajadores cualificados agropecuarios", "Oficiales, operarios y artesanos", "Operadores de instalaciones y maquinaria",
         "Ocupaciones elementales", "Ocupaciones militares", "Parados/as", "Jubilados/as y pensionistas", "Estudiantes",
         "Trabajo doméstico no remunerado", "Otra situación inactiva", "NS", "NC", NA)
  g <- grupo_ocupacion(x)
  expect_equal(g[1:2], rep(GRUPOS_OCUPACION[1], 2))
  expect_equal(g[3:4], rep(GRUPOS_OCUPACION[2], 2))
  expect_equal(g[5], GRUPOS_OCUPACION[3])
  expect_equal(g[6:8], rep(GRUPOS_OCUPACION[4], 3))
  expect_equal(g[9:15], GRUPOS_OCUPACION[5:11])
  expect_equal(g[16:17], c("NS", "NC"))
  expect_true(is.na(g[18]))
})

test_that("una ocupación desconocida detiene la armonización en vez de pasar en silencio", {
  expect_error(grupo_ocupacion("Astronauta"), "Ocupación sin grupo")
})

test_that("grupo_ideologia corta la escala 1-10 en cinco grupos y deja NA fuera de ella", {
  expect_equal(grupo_ideologia(c(1, 2, 3, 5, 8, 10, NA, 99)),
               c("Izquierda (1-2)", "Izquierda (1-2)", "Centro izquierda (3-4)", "Centro (5-6)", "Centro derecha (7-8)", "Derecha (9-10)", NA, NA))
})
