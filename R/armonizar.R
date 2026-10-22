# Armonización: .sav de cada estudio -> microdatos con categorías comunes

cargar_insumos <- function(f_crosswalk, f_estudios, f_partidos, f_problemas, f_candidatos, f_lideres,
                           f_rupturas, f_conceptos, f_decisiones, f_sin_etiqueta, f_variables) {
  leer <- function(f) readr::read_csv(f, col_types = readr::cols(.default = "c"), progress = FALSE)
  cw <- leer(f_crosswalk)
  # códigos de partido presentes en los datos pero sin etiqueta en el .sav, resueltos a mano con su fuente
  sin_etq <- leer(f_sin_etiqueta)
  est <- leer(f_estudios)
  partidos <- dplyr::bind_rows(
    leer(f_partidos),
    dplyr::transmute(sin_etq, estudio, mes = est$mes[match(estudio, est$estudio)], concepto,
                     variable = NA_character_, codigo, etiqueta, partido_armonizado, es_no_respuesta = "False"))
  # Tramos de cada concepto: una ruptura C abre un tramo nuevo (las categorías de un tramo a otro no son comparables)
  cw <- cw |>
    dplyr::arrange(concepto, mes) |>
    dplyr::group_by(concepto) |>
    dplyr::mutate(tramo = cumsum(nivel_final %in% "C") + 1L) |>
    dplyr::ungroup()
  list(
    crosswalk = cw,
    estudios = est,
    partidos = partidos,
    codigos_sin_etiqueta = sin_etq,
    problemas = leer(f_problemas),
    candidatos = leer(f_candidatos),
    lideres = leer(f_lideres) |> dplyr::filter(bloque == "VALORALIDERES"),
    # valoración de ministros (trimestral): batería VALMINIS_k, con el nombre del ministro como etiqueta de la variable
    ministros = leer(f_variables) |> dplyr::filter(grepl("^VALMINIS_[0-9]+$", variable)) |>
      dplyr::transmute(estudio, mes, variable, ministro = etiqueta,
                       id = paste0("ministro_", gsub(" ", "_", norm_etiqueta(etiqueta)))),
    rupturas = leer(f_rupturas),
    conceptos = leer(f_conceptos),
    decisiones = leer(f_decisiones)
  )
}

# Lectura de un estudio: códigos por concepto y diccionario de etiquetas (sin armonizar todavía)
leer_estudio <- function(estudio, ruta, insumos) {
  cw <- dplyr::filter(insumos$crosswalk, .data$estudio == !!estudio, !is.na(variable))
  cw <- dplyr::filter(cw, concepto != "tipo_telefono")
  lid <- dplyr::filter(insumos$lideres, .data$estudio == !!estudio)
  mins <- dplyr::filter(insumos$ministros, .data$estudio == !!estudio)
  vars <- unique(c(cw$variable, lid$variable, mins$variable))
  sav <- haven::read_sav(ruta, user_na = TRUE, col_select = dplyr::all_of(vars))
  pares <- stats::setNames(cw$variable, cw$concepto)
  if (nrow(lid)) pares <- c(pares, stats::setNames(lid$variable, paste0("lider_", gsub(" ", "_", lid$lider_norm))))
  if (nrow(mins)) pares <- c(pares, stats::setNames(mins$variable, mins$id))
  valores <- purrr::map(pares, \(v) valores_sav(sav[[v]]))
  dic <- purrr::imap(valores, \(x, k) dplyr::count(x, codigo, etiqueta, nr) |> dplyr::mutate(concepto = k)) |>
    purrr::list_rbind() |>
    dplyr::mutate(estudio = estudio, .before = 1)
  list(estudio = estudio, mes = cw$mes[1], n = nrow(sav), valores = valores, dic = dic)
}

# Etiqueta canónica de las variables cerradas. Dentro de cada tramo se toma como referencia el último estudio:
# una etiqueta se lleva a la de referencia si coincide normalizada o si, con el mismo código, es una variante
# cosmética. Si no, se conserva la propia y queda en el registro para revisión.
canon_cerradas <- function(lecturas, insumos) {
  dic <- purrr::map(lecturas, "dic") |> purrr::list_rbind() |>
    dplyr::filter(concepto %in% CONCEPTOS_CERRADOS, !is.na(codigo))
  tramos <- dplyr::select(insumos$crosswalk, concepto, estudio, mes, tramo)
  dic <- dplyr::inner_join(dic, tramos, by = c("concepto", "estudio"))
  sust <- dplyr::filter(dic, !nr)
  ref <- sust |>
    dplyr::group_by(concepto, tramo) |>
    dplyr::filter(mes == max(mes)) |>
    dplyr::distinct(concepto, tramo, codigo, etiqueta_ref = etiqueta) |>
    dplyr::ungroup()
  sust <- sust |>
    dplyr::distinct(concepto, tramo, estudio, mes, codigo, etiqueta) |>
    dplyr::left_join(dplyr::rename(ref, codigo_ref = codigo), by = c("concepto", "tramo"), relationship = "many-to-many") |>
    dplyr::group_by(concepto, tramo, estudio, mes, codigo, etiqueta) |>
    dplyr::summarise(
      # 1) misma etiqueta normalizada en el estudio de referencia; 2) mismo código dentro del tramo (las
      # rupturas C ya separan los cambios de categorías, así que dentro de un tramo el código es estable);
      # 3) etiqueta propia (categoría que no existe en el estudio de referencia)
      categoria = {
        e <- dplyr::first(etiqueta)
        igual <- etiqueta_ref[!is.na(e) & norm_etiqueta(etiqueta_ref) == norm_etiqueta(e)]
        mismo <- etiqueta_ref[codigo_ref == dplyr::first(codigo)]
        if (length(igual)) igual[1]
        else if (length(mismo)) mismo[1]
        else if (is.na(e)) cod_chr(dplyr::first(codigo))
        else e
      },
      similitud = if (is.na(dplyr::first(etiqueta))) NA_real_ else
        round(1 - utils::adist(norm_etiqueta(dplyr::first(etiqueta)), norm_etiqueta(categoria))[1, 1] /
                max(nchar(norm_etiqueta(dplyr::first(etiqueta))), nchar(norm_etiqueta(categoria)), 1), 2),
      orden = min(codigo_ref[etiqueta_ref %in% categoria], dplyr::first(codigo) + 1e4),
      .groups = "drop"
    ) |>
    dplyr::left_join(dplyr::distinct(ref, concepto, tramo, categoria = etiqueta_ref) |> dplyr::mutate(en_ref = TRUE),
                     by = c("concepto", "tramo", "categoria")) |>
    dplyr::mutate(registro = dplyr::case_when(
      is.na(en_ref) & is.na(etiqueta) ~ "código sin etiqueta",
      is.na(en_ref) ~ "categoría ausente en el estudio de referencia",
      is.na(etiqueta) ~ "código sin etiqueta (se usa la del estudio de referencia)",
      categoria != etiqueta ~ "variante de etiqueta",
      TRUE ~ ""
    ))
  nr <- dic |>
    dplyr::filter(nr) |>
    dplyr::distinct(concepto, tramo, estudio, mes, codigo, etiqueta) |>
    dplyr::mutate(categoria = tipo_no_respuesta(etiqueta, codigo), orden = 1e6, registro = "")
  dplyr::bind_rows(sust, nr) |>
    dplyr::mutate(categoria = sub("^\\(NO LEER\\)\\s*", "", categoria)) |>   # instrucción al entrevistador, no parte de la categoría
    dplyr::select(concepto, tramo, estudio, mes, codigo, etiqueta, categoria, orden, similitud, registro)
}

# Correcciones de errores del fichero del CIS --------------------------------------------------------------
# 3582 (oct-2026): ESTUDIOS viene vacío (5.010 de 5.024 casos como N.C.). Se reconstruye desde NIVELESTENTREV
# con la correspondencia NIVELESTENTREV -> ESTUDIOS de los estudios del mismo tramo (la más frecuente por código).
CORRECCIONES <- list(
  list(estudio = "3582", concepto = "estudios", desde = "nivel_estudios", aprender_de = c("3571", "3577"),
       motivo = "ESTUDIOS vacío en el fichero del CIS (5.010 de 5.024 casos como N.C.); reconstruido desde NIVELESTENTREV")
)

aplicar_correcciones <- function(lecturas) {
  ids <- purrr::map_chr(lecturas, "estudio")
  for (cc in CORRECCIONES) {
    i <- match(cc$estudio, ids)
    if (is.na(i)) next
    tabla <- purrr::map(lecturas[match(cc$aprender_de, ids)], \(l)
      tibble::tibble(origen = l$valores[[cc$desde]]$codigo, destino = l$valores[[cc$concepto]]$codigo)) |>
      purrr::list_rbind() |>
      dplyr::count(origen, destino) |>
      dplyr::slice_max(n, n = 1, by = origen, with_ties = FALSE)
    x <- lecturas[[i]]$valores[[cc$concepto]]
    origen <- lecturas[[i]]$valores[[cc$desde]]$codigo
    nuevo <- tabla$destino[match(origen, tabla$origen)]
    etiquetas <- dplyr::distinct(dplyr::bind_rows(x, purrr::map(lecturas[match(cc$aprender_de, ids)],
                                                                \(l) l$valores[[cc$concepto]])), codigo, etiqueta, nr)
    etiquetas <- etiquetas[!duplicated(etiquetas$codigo), ]
    lecturas[[i]]$valores[[cc$concepto]] <- tibble::tibble(
      codigo = nuevo, etiqueta = etiquetas$etiqueta[match(nuevo, etiquetas$codigo)],
      nr = etiquetas$nr[match(nuevo, etiquetas$codigo)])
    lecturas[[i]]$dic <- dplyr::bind_rows(
      dplyr::filter(lecturas[[i]]$dic, concepto != cc$concepto),
      dplyr::count(lecturas[[i]]$valores[[cc$concepto]], codigo, etiqueta, nr) |>
        dplyr::mutate(concepto = cc$concepto, estudio = cc$estudio))
    lecturas[[i]]$correcciones <- c(lecturas[[i]]$correcciones, cc$motivo)
  }
  lecturas
}

grupo_edad <- function(e) {
  cut(e, c(17, 24, 34, 44, 54, 64, Inf), labels = c("18-24", "25-34", "35-44", "45-54", "55-64", "65 y más")) |>
    as.character() |> tidyr::replace_na("NC")
}

# Grupo ocupacional a partir de la ocupación recodificada por el CIS (grandes grupos de la CNO-11 y situaciones
# de inactividad). No es un esquema de clase social: agrupa ocupaciones con un nivel de cualificación parecido.
GRUPOS_OCUPACION <- c(
  "Directivos y profesionales", "Técnicos y administrativos", "Servicios y comercio",
  "Trabajadores manuales cualificados", "Ocupaciones elementales", "Otras ocupaciones", "En paro",
  "Jubilados y pensionistas", "Estudiantes", "Trabajo doméstico no remunerado", "Otra situación inactiva")
grupo_ocupacion <- function(x) {
  e <- norm_etiqueta(x)
  g <- dplyr::case_when(
    grepl("^(directores|profesionales cientificos)", e) ~ GRUPOS_OCUPACION[1],
    grepl("^(tecnicos|personal de apoyo administrativo)", e) ~ GRUPOS_OCUPACION[2],
    grepl("^trabajadores as de los servicios", e) ~ GRUPOS_OCUPACION[3],
    grepl("^(agricultores|oficiales|operadores)", e) ~ GRUPOS_OCUPACION[4],
    grepl("^ocupaciones elementales", e) ~ GRUPOS_OCUPACION[5],
    grepl("^(ocupaciones militares|otra o ocupacion|otra ocupacion)", e) ~ GRUPOS_OCUPACION[6],
    grepl("^parados", e) ~ GRUPOS_OCUPACION[7],
    grepl("^jubilad", e) ~ GRUPOS_OCUPACION[8],
    grepl("^estudiante", e) ~ GRUPOS_OCUPACION[9],
    grepl("^trabajo domestico", e) ~ GRUPOS_OCUPACION[10],
    grepl("^otra situacion inactiva", e) ~ GRUPOS_OCUPACION[11],
    x %in% names(NO_RESPUESTA) ~ x
  )
  sin <- !is.na(x) & is.na(g)
  if (any(sin)) stop("Ocupación sin grupo: ", paste(unique(x[sin]), collapse = "; "))
  g
}

grupo_ideologia <- function(v) {
  dplyr::case_when(v %in% 1:2 ~ "Izquierda (1-2)", v %in% 3:4 ~ "Centro izquierda (3-4)",
                   v %in% 5:6 ~ "Centro (5-6)", v %in% 7:8 ~ "Centro derecha (7-8)", v %in% 9:10 ~ "Derecha (9-10)")
}

# Aplica un mapa (estudio, código) -> id; los códigos de no respuesta no mapeados toman su tipo (NS/NC/NR/NP)
mapear <- function(x, mapa_codigos, mapa_ids) {
  id <- mapa_ids[match(cod_chr(x$codigo), mapa_codigos)]
  sin <- is.na(id) & !is.na(x$codigo)
  id[sin & x$nr] <- tipo_no_respuesta(x$etiqueta[sin & x$nr], x$codigo[sin & x$nr])
  id[is.na(id) & !is.na(x$codigo)] <- "SIN_MAPA"
  id
}

armonizar_estudio <- function(lectura, canon, insumos) {
  e <- lectura$estudio
  v <- lectura$valores
  out <- tibble::tibble(estudio = as.integer(e), mes = lectura$mes, .rows = lectura$n)
  out$peso <- v$peso$codigo
  out$peso_ccaa <- if (!is.null(v$peso_ccaa)) v$peso_ccaa$codigo else NA_real_
  for (k in CONCEPTOS_PARTIDO) {
    m <- dplyr::filter(insumos$partidos, estudio == e, concepto == k)
    out[[k]] <- if (is.null(v[[k]])) NA_character_ else mapear(v[[k]], m$codigo, m$partido_armonizado)
  }
  for (k in CONCEPTOS_PROBLEMA) {
    m <- dplyr::filter(insumos$problemas, estudio == e, bloque == substr(k, 1, 8))
    out[[k]] <- if (is.null(v[[k]])) NA_character_ else mapear(v[[k]], m$codigo, m$id_armonizado)
  }
  m <- dplyr::filter(insumos$candidatos, estudio == e)
  out$pref_presidente <- if (is.null(v$pref_presidente)) NA_character_ else mapear(v$pref_presidente, m$codigo, m$id_armonizado)
  for (k in CONCEPTOS_CERRADOS) {
    if (is.null(v[[k]])) { out[[k]] <- NA_character_; next }
    m <- dplyr::filter(canon, estudio == e, concepto == k)
    out[[k]] <- m$categoria[match(v[[k]]$codigo, m$codigo)]
  }
  # escalas y variables continuas
  id <- v$ideologia
  out$ideologia <- ifelse(!id$nr & id$codigo %in% 1:10, id$codigo, NA_real_)
  out$ideologia_cat <- ifelse(id$nr, tipo_no_respuesta(id$etiqueta, id$codigo), cod_chr(id$codigo))
  out$ideologia_g <- dplyr::coalesce(grupo_ideologia(out$ideologia), ifelse(id$nr, tipo_no_respuesta(id$etiqueta, id$codigo), NA))
  out$ocupacion_g <- grupo_ocupacion(out$ocupacion_r)
  ed <- v$edad
  out$edad <- ifelse(ed$nr, NA_real_, ed$codigo)
  out$edad_g <- grupo_edad(out$edad)
  # valoración de líderes y ministros: 1-10; el resto (no conoce, NS, NC, no procede) queda fuera de la media
  for (k in grep("^(lider|ministro)_", names(v), value = TRUE)) {
    x <- v[[k]]
    out[[k]] <- ifelse(!x$nr & x$codigo %in% 1:10, x$codigo, NA_real_)
  }
  out
}

# Une los estudios; las variables categóricas se guardan como diccionario en el Parquet
unir_estudios <- function(armonizados) {
  d <- dplyr::bind_rows(armonizados)
  lideres <- c(sort(grep("^lider_", names(d), value = TRUE)), sort(grep("^ministro_", names(d), value = TRUE)))
  d <- dplyr::relocate(d, estudio, mes, peso, peso_ccaa, dplyr::any_of(c(CONCEPTOS_PARTIDO, "pref_presidente",
                       CONCEPTOS_PROBLEMA, "eco_esp", "eco_per", "ideologia", "ideologia_cat", "ideologia_g")),
                       dplyr::all_of(lideres))
  dplyr::mutate(d, dplyr::across(dplyr::where(is.character) & !dplyr::all_of("mes"), as.factor))
}

escribir_parquet <- function(d, ruta) {
  dir.create(dirname(ruta), recursive = TRUE, showWarnings = FALSE)
  arrow::write_parquet(d, ruta, compression = "zstd", compression_level = 19)
  ruta
}
