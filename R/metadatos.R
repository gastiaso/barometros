# Metadatos para la web: estudios, conceptos con sus categorías y tramos, líderes y rupturas

etiquetas_lista <- function(mapa, col_id, col_etq) {
  mapa |>
    dplyr::filter(!.data[[col_id]] %in% names(NO_RESPUESTA)) |>
    dplyr::arrange(dplyr::desc(mes)) |>
    dplyr::distinct(id = .data[[col_id]], .keep_all = TRUE) |>
    dplyr::transmute(id, etiqueta = .data[[col_etq]])
}

construir_metadatos <- function(d, canon, insumos, lecturas) {
  cw <- insumos$crosswalk
  conc <- insumos$conceptos
  est <- insumos$estudios
  correcciones <- purrr::map(lecturas, \(l) list(estudio = l$estudio, correcciones = l$correcciones)) |>
    purrr::keep(\(x) length(x$correcciones) > 0)
  et_part <- etiquetas_lista(insumos$partidos, "partido_armonizado", "etiqueta")
  et_prob <- etiquetas_lista(insumos$problemas, "id_armonizado", "etiqueta_armonizada")
  et_cand <- etiquetas_lista(insumos$candidatos, "id_armonizado", "etiqueta_armonizada")
  et_nr <- tibble::tibble(id = names(NO_RESPUESTA), etiqueta = unname(NO_RESPUESTA))

  categorias <- function(k) {
    presentes <- levels(d[[k]])
    if (is.null(presentes)) return(NULL)
    tab <- if (k %in% CONCEPTOS_PARTIDO) et_part else if (k %in% CONCEPTOS_PROBLEMA) et_prob
           else if (k == "pref_presidente") et_cand else NULL
    if (k %in% CONCEPTOS_CERRADOS) {
      ord <- canon |> dplyr::filter(concepto == k) |> dplyr::arrange(dplyr::desc(tramo), orden) |>
        dplyr::distinct(categoria)
      tab <- tibble::tibble(id = ord$categoria, etiqueta = ord$categoria)
    }
    if (k == "ideologia_cat") tab <- tibble::tibble(id = as.character(1:10), etiqueta = c("1 Izquierda", 2:9, "10 Derecha"))
    if (k == "ideologia_g") tab <- tibble::tibble(id = c("Izquierda (1-2)", "Centro izquierda (3-4)", "Centro (5-6)",
                                                         "Centro derecha (7-8)", "Derecha (9-10)"), etiqueta = id)
    if (k == "edad_g") tab <- tibble::tibble(id = c("18-24", "25-34", "35-44", "45-54", "55-64", "65 y más"), etiqueta = id)
    tab <- dplyr::bind_rows(dplyr::filter(tab, !id %in% et_nr$id), et_nr)
    tab <- dplyr::filter(tab, id %in% presentes) |> dplyr::distinct(id, .keep_all = TRUE)
    faltan <- setdiff(presentes, tab$id)
    dplyr::bind_rows(tab, tibble::tibble(id = faltan, etiqueta = faltan)) |> dplyr::mutate(no_respuesta = id %in% et_nr$id)
  }

  estado_estudios <- function(k) {
    x <- dplyr::filter(cw, concepto == k) |> dplyr::arrange(mes)
    if (!nrow(x)) return(NULL)
    dplyr::transmute(x, estudio, mes, nivel = nivel_final, tramo, nota = dplyr::if_else(nivel_final == "A", NA_character_, nota))
  }

  derivados <- list(
    ideologia_cat = list(etiqueta = "Autoubicación ideológica (1-10)", base = "ideologia"),
    ideologia_g = list(etiqueta = "Ideología (5 grupos)", base = "ideologia"),
    edad_g = list(etiqueta = "Edad (6 grupos)", base = "edad")
  )
  cols <- setdiff(names(d), c("estudio", "mes", "peso", "peso_ccaa"))
  lideres <- grep("^lider_", cols, value = TRUE)
  nom_lider <- insumos$lideres |> dplyr::distinct(lider_norm, lider) |>
    dplyr::mutate(id = paste0("lider_", gsub(" ", "_", lider_norm)))
  conceptos <- purrr::map(stats::setNames(cols, cols), \(k) {
    base <- if (k %in% names(derivados)) derivados[[k]]$base else k
    fila <- dplyr::filter(conc, concepto == base)
    list(
      etiqueta = if (k %in% names(derivados)) derivados[[k]]$etiqueta
                 else if (k %in% lideres) paste("Valoración de", nom_lider$lider[match(k, nom_lider$id)], "(1-10)")
                 else fila$descripcion[1],
      bloque = if (k %in% lideres) "serie" else if (k %in% c("edad_g", "ideologia_g")) "cruce" else fila$bloque[1],
      tipo = if (is.numeric(d[[k]])) "numerica" else "categorica",
      categorias = categorias(k),
      estudios = estado_estudios(base),
      rupturas = insumos$rupturas |> dplyr::filter(grepl(paste0("\\b", base, "\\b"), conceptos_afectados) |
                                                     conceptos_afectados == "todas") |> dplyr::pull(ruptura_id)
    )
  })
  list(
    fuente = "Centro de Investigaciones Sociológicas (CIS), barómetros mensuales. Elaboración propia.",
    generado = format(Sys.time(), "%Y-%m-%d %H:%M"),
    no_respuesta = as.list(NO_RESPUESTA),
    estudios = dplyr::select(est, estudio, mes, titulo, n, deff = deff_kish, fecha_campo_inicio, fecha_campo_fin) |>
      dplyr::mutate(n = as.integer(n), deff = as.numeric(deff)),
    correcciones = correcciones,
    conceptos = conceptos,
    rupturas = insumos$rupturas
  )
}

escribir_metadatos <- function(meta, ruta) {
  dir.create(dirname(ruta), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(meta, ruta, auto_unbox = TRUE, na = "null", null = "null", dataframe = "rows", pretty = FALSE)
  ruta
}
