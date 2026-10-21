"""Borrador de crosswalk concepto x estudio para los barómetros CIS (ene 2021 - oct 2026).

Lee los .sav extraídos y genera, en OUT:
  conceptos.csv                 especificación de conceptos y reglas de emparejamiento
  crosswalk_borrador.csv        concepto x estudio: variable emparejada, método, cambios detectados, nivel propuesto (A/B/C)
  matriz_cobertura.csv          concepto x mes con la variable usada y el nivel ("—" si falta)
  lideres.csv                   estudio x líder: posición en VALORALIDERES_k / LIDERESCONOCE_k
  codigos_listas.csv            listas abiertas (partidos, candidatos, problemas): código -> etiqueta por estudio
  codigos_cambio_significado.csv códigos cuyo significado cambia entre estudios
  partidos_etiquetas.csv        etiquetas de partido distintas, con propuesta de partido armonizado (a revisar)
  rupturas_candidatas.csv       semilla del registro de rupturas
  estudios.csv (se amplía)      + fechas de campo y deff
"""
import csv, glob, json, os, re, sys, unicodedata, collections, datetime, difflib
import pyreadstat

S = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.join(S, "inventario")

# ---------------------------------------------------------------- utilidades
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(no leer\)", "", s)
    s = re.sub(r"\[recodificad[ao]\]", "", s)
    return re.sub(r"[^a-z0-9+]+", " ", s).strip()

MISSING_RX = re.compile(r"^(n s|n c|n p|n r|ns|nc|np|no procede|no sabe|no contesta|no recuerda|no conoce|"
                        r"no lo sabe|no lo la conoce|n s n r|n s n c)\b")

def is_missing_label(lab):
    return bool(MISSING_RX.match(norm(lab)))

def code_str(k):
    return str(int(k)) if isinstance(k, float) and k.is_integer() else str(k)

SINONIMOS = [(r"\bparado a\b", "en paro"), (r"\btrab\b", "trabajadores"), (r"\bsup\b", "superior"),
             (r"\bdomingos o festivos\b", "domingos y festivos")]

def related(a, b):
    """True si dos etiquetas normalizadas son variantes cosméticas: truncado, abreviatura, orden de palabras
    o redacción casi idéntica. False si apuntan a categorías distintas (p. ej. «PP» vs «PSOE»)."""
    for rx, rep in SINONIMOS:
        a, b = re.sub(rx, rep, a), re.sub(rx, rep, b)
    if a == b or a.startswith(b) or b.startswith(a):
        return True
    ta, tb = a.split(), b.split()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    contain = sum(t in set(long_) for t in short) / max(1, len(short))
    n = min(len(a), len(b))
    ratio_prefix = difflib.SequenceMatcher(None, a[:n], b[:n]).ratio()
    return contain >= 0.75 or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85 or (n >= 40 and ratio_prefix >= 0.8) or (n >= 30 and a[:30] == b[:30]) or (n >= 45 and ta[0] == tb[0])

# ---------------------------------------------------------------- conceptos
# (id, bloque, tipo, descripcion, nombres candidatos, regex etiqueta, ocurrencia)
CONCEPTOS = [
    ("prob_esp_1", "serie", "abierta", "Primer problema de España", ["PESPANNA1"], r"^primer problema$", 0),
    ("prob_esp_2", "serie", "abierta", "Segundo problema de España", ["PESPANNA2"], r"^segundo problema$", 0),
    ("prob_esp_3", "serie", "abierta", "Tercer problema de España", ["PESPANNA3"], r"^tercer problema$", 0),
    ("prob_per_1", "serie", "abierta", "Primer problema que más afecta personalmente", ["PPERSONAL1"], r"^primer problema$", 1),
    ("prob_per_2", "serie", "abierta", "Segundo problema personal", ["PPERSONAL2"], r"^segundo problema$", 1),
    ("prob_per_3", "serie", "abierta", "Tercer problema personal", ["PPERSONAL3"], r"^tercer problema$", 1),
    ("eco_esp", "serie", "cerrada", "Valoración de la situación económica general de España", ["ECOESP"],
     r"situacion economica general de espana", 0),
    ("eco_per", "serie", "cerrada", "Valoración de la situación económica personal actual", ["ECOPER"],
     r"situacion economica personal actual", 0),
    ("ideologia", "serie+cruce", "escala", "Autoubicación ideológica (1-10)", ["ESCIDEOL"], r"autoubicacion ideologica", 0),
    ("intencion_voto", "serie", "abierta", "Intención de voto en generales (directa)", ["INTENCIONG"],
     r"^intencion de voto en (unas )?(supuestas )?(las )?elecciones generales", 0),
    ("intencion_voto_r", "serie", "abierta", "Intención de voto en generales [recodificada CIS]", ["INTENCIONGR"], None, 0),
    ("intencion_alternativa", "serie", "abierta", "Intención de voto alternativo", ["INTENCIONGALTER"], None, 0),
    ("voto_simpatia", "serie", "abierta", "Voto + simpatía", ["VOTOSIMG"], r"^voto simpatia", 0),
    ("simpatia", "serie", "abierta", "Partido por el que siente más simpatía", ["SIMPATIA"], r"mas simpatia", 0),
    ("cercania", "serie", "abierta", "Partido más cercano a sus ideas", ["CERCANIA"], r"mas cercano a sus ideas", 0),
    ("pref_presidente", "serie", "abierta", "Preferencia personal como presidente del Gobierno", ["PREFPTE"],
     r"preferencia personal como presidente", 0),
    ("participacion_g", "cruce", "cerrada", "Participación en las últimas generales", ["PARTICIPACIONG"],
     r"^participacion electoral en las elecciones generales", 0),
    ("recuerdo_voto", "cruce", "abierta", "Recuerdo de voto en las últimas generales (con participación)", ["RECUERDO"], None, 0),
    ("recuerdo_votantes_r", "cruce", "abierta", "Recuerdo de voto de los votantes [recodificada CIS]", ["RECUVOTOGR"], None, 0),
    ("sexo", "cruce", "cerrada", "Sexo", ["SEXO"], None, 0),
    ("edad", "cruce", "continua", "Edad", ["EDAD"], None, 0),
    ("ccaa", "cruce", "cerrada", "Comunidad autónoma", ["CCAA"], None, 0),
    ("provincia", "cruce", "cerrada", "Provincia", ["PROV"], None, 0),
    ("tamuni", "cruce", "cerrada", "Tamaño de municipio", ["TAMUNI"], None, 0),
    ("estudios", "cruce", "cerrada", "Estudios (recodificación CIS, 6 niveles)", ["ESTUDIOS"], None, 0),
    ("nivel_estudios", "cruce", "cerrada", "Nivel de estudios detallado", ["NIVELESTENTREV"], None, 0),
    ("sitlab", "cruce", "cerrada", "Situación laboral", ["SITLAB"], None, 0),
    ("ocupacion_r", "cruce", "cerrada", "Población activa e inactiva (CNO11 recodificada)", ["CNO11R"], None, 0),
    ("clase_subjetiva", "cruce", "cerrada", "Identificación subjetiva de clase", ["CLASESUB"], None, 0),
    ("clase_social", "cruce", "cerrada", "Clase social subjetiva (detallada)", ["CLASESOCIAL"], None, 0),
    ("religiosidad", "cruce", "cerrada", "Religiosidad", ["RELIGION"], None, 0),
    ("practica_religiosa", "cruce", "cerrada", "Frecuencia de asistencia a oficios religiosos", ["PRACTICARELIG6", "PRACTICARELIG"], None, 0),
    ("estado_civil", "cruce", "cerrada", "Estado civil", ["ECIVIL"], None, 0),
    ("tipo_telefono", "tecnica", "cerrada", "Tipo de teléfono (fijo/móvil)", ["TIPO_TEL"], None, 0),
    ("peso", "tecnica", "continua", "Ponderación de la muestra general", ["PESO", "PESO_V2"],
     r"^ponderacion|coeficientes de ponderacion", 0),
    ("peso_ccaa", "tecnica", "continua", "Ponderación por CCAA", ["PESOCCAA"], None, 0),
]
LISTAS_PARTIDO = {"intencion_voto", "intencion_voto_r", "intencion_alternativa", "voto_simpatia", "simpatia",
                  "cercania", "recuerdo_voto", "recuerdo_votantes_r"}

# Propuesta de partido armonizado por expresión regular sobre la etiqueta normalizada (revisable).
PARTIDOS_RX = [
    ("ESCANOS_BLANCO", r"escanos en blanco"), ("BLANCO", r"^en blanco$|^voto en blanco$"),
    ("NULO", r"voto nulo|^nulo$"), ("NINGUNO", r"^ninguno"),
    ("SIN_DERECHO", r"no tenia edad|no tenia derecho"), ("NO_VOTO", r"^no voto$|no fue a votar|prefirio no votar|me abstuve"),
    ("NO_VOTARIA", r"no votaria|abstencion"),
    ("PSOE", r"^psoe$|^psc$|psc psoe|^psoe "), ("PP", r"^pp$|^pp |partido popular"), ("VOX", r"^vox$"),
    ("SUMAR", r"^sumar$|^sumar |movimiento sumar"), ("EN_COMUN_GAL", r"en comun"), ("EN_COMU_CAT", r"en comu podem"),
    ("ELKARREKIN", r"elkarrekin"), ("PODEMOS", r"^podemos$"), ("UP", r"unidas podemos|^up$|podemos iu"),
    ("CS", r"^c s$|ciudadanos"), ("MAS_PAIS", r"mas pais"), ("COMPROMIS", r"compromis"), ("ERC", r"^erc"),
    ("JUNTS", r"^junts|jxcat"), ("BILDU", r"bildu"), ("PNV", r"pnv"), ("BNG", r"^bng"), ("CUP", r"^cup"),
    ("CC", r"^cca?( pnc)?$|coalicion canaria"), ("UPN", r"^upn$|^na\+?$|navarra suma"), ("PACMA", r"pacma"),
    ("TERUEL_EXISTE", r"teruel"), ("SALF", r"se acabo la fiesta|^salf$"), ("IU", r"^iu$"),
    ("OTRO", r"^otro|^otros"),
    ("NS_NC", r"^n s$|^n c$|no sabe|no recuerda|^n r$|todavia no lo ha decidido|no lo sabe|duda"),
]

def partido_propuesto(lab_norm):
    for pid, rx in PARTIDOS_RX:
        if re.search(rx, lab_norm):
            return pid
    return ""

# ---------------------------------------------------------------- estudios
estudios = list(csv.DictReader(open(f"{OUT}/estudios.csv", encoding="utf-8")))
sav_of = {e["estudio"]: [p for p in glob.glob(f"{S}/datos/extract/{e['estudio']}/*") if p.lower().endswith(".sav")][0]
          for e in estudios}

cw_rows, lider_rows, lista_rows = [], [], []
prev = {}                       # concepto -> info del último estudio con el concepto
modal_name = {c[0]: c[4][0] for c in CONCEPTOS}

for e in estudios:
    c = e["estudio"]
    p = sav_of[c]
    _, meta = pyreadstat.read_sav(p, metadataonly=True)
    names = meta.column_names
    labs = {v: (meta.column_names_to_labels.get(v) or "").strip() for v in names}
    vls = meta.variable_value_labels

    # ---- emparejamiento
    matched = {}
    for cid, bloque, tipo, desc, cands, rx, occ in CONCEPTOS:
        var, metodo = "", ""
        for cand in cands:
            if cand in names:
                var, metodo = cand, "nombre"
                break
        if not var and rx:
            hits = [v for v in names if re.search(rx, norm(labs[v]))]
            if len(hits) > occ:
                var, metodo = hits[occ], "etiqueta"
        matched[cid] = (var, metodo)

    # ---- lectura de datos para las variables emparejadas + fecha + líderes
    lider_vars = [v for v in names if re.match(r"^(VALORALIDERES|LIDERESCONOCE)_\d+$", v)]
    usecols = sorted({v for v, _ in matched.values() if v} | {"IA_E1_DIA", "IA_E1_MES", "IA_E1_ANYO"} & set(names)
                     | set(lider_vars))
    df, _ = pyreadstat.read_sav(p, usecols=usecols)

    # fechas de campo
    if {"IA_E1_DIA", "IA_E1_MES", "IA_E1_ANYO"} <= set(df.columns):
        d = df[["IA_E1_ANYO", "IA_E1_MES", "IA_E1_DIA"]].dropna()
        d = d[(d.IA_E1_MES <= 12) & (d.IA_E1_DIA <= 31)]
        fechas = sorted(datetime.date(2000 + int(a), int(m), int(dd)) for a, m, dd in d.itertuples(index=False))
        e["fecha_campo_inicio"], e["fecha_campo_fin"] = fechas[0].isoformat(), fechas[-1].isoformat()
        e["fecha_campo_mediana"] = fechas[len(fechas) // 2].isoformat()
    # pesos
    e["salto_deff"] = ""

    # ---- líderes
    for v in lider_vars:
        k = int(v.split("_")[-1])
        lider_rows.append({"mes": e["mes"], "estudio": c, "lider": labs[v], "lider_norm": norm(labs[v]),
                           "bloque": v.split("_")[0], "posicion": k, "variable": v,
                           "codigos_missing": ";".join(sorted((code_str(x) for x, l in (vls.get(v) or {}).items() if is_missing_label(l)), key=float)),
                           "n_validos_1a10": int(df[v].between(1, 10).sum()) if v.startswith("VALORA") else ""})

    # ---- fila de crosswalk por concepto
    for cid, bloque, tipo, desc, cands, rx, occ in CONCEPTOS:
        var, metodo = matched[cid]
        row = {"concepto": cid, "mes": e["mes"], "estudio": c, "variable": var, "metodo": metodo,
               "etiqueta": labs.get(var, ""), "tipo": tipo}
        if not var:
            row.update({"nivel_propuesto": "AUSENTE", "cambios": "concepto no encontrado en el estudio"})
            cw_rows.append(row)
            continue
        vl = {code_str(k): str(l).strip() for k, l in (vls.get(var) or {}).items()}
        miss = {k for k, l in vl.items() if is_missing_label(l)}
        subst = {k: norm(l) for k, l in vl.items() if k not in miss}
        col = df[var]
        obs = {code_str(x) for x in col.dropna().unique()}
        row["n_validos"] = int(col.notna().sum() - col.isin([float(m) for m in miss if re.fullmatch(r"-?\d+", m)]).sum())
        if tipo == "continua":
            row["rango_observado"] = f"{col.min():g}–{col.max():g}"
        elif tipo == "escala":
            row["rango_observado"] = ",".join(sorted((o for o in obs if o not in miss), key=lambda x: float(x)))
        row["n_categorias"] = len(subst)
        row["codigos_missing"] = ";".join(sorted(miss, key=lambda x: float(x) if re.fullmatch(r"-?\d+(\.\d+)?", x) else 0))

        cambios, nivel = [], "A"
        if var != modal_name[cid]:
            cambios.append(f"nombre distinto ({var})")
        pv = prev.get(cid)
        if pv:
            if norm(labs[var]) != pv["lab"]:
                cambios.append(f"enunciado cambia: «{pv['lab_raw']}» → «{labs[var]}»")
                nivel = "B"
            if pv["miss"] != miss:
                cambios.append(f"códigos de no respuesta cambian: {sorted(pv['miss'])} → {sorted(miss)}")
                nivel = max(nivel, "B")
            if tipo == "cerrada":
                add, rem = set(subst) - set(pv["subst"]), set(pv["subst"]) - set(subst)
                if add or rem:
                    cambios.append("categorías " + " ".join([f"+{k}:{vl[k]}" for k in sorted(add)] +
                                                             [f"-{k}:{pv['subst_raw'][k]}" for k in sorted(rem)]))
                    nivel = "C"
                txt = [k for k in set(subst) & set(pv["subst"]) if subst[k] != pv["subst"][k]]
                if txt:
                    sev = all(related(subst[k], pv["subst"][k]) for k in txt)
                    cambios.append(("redacción de categorías" if sev else "SIGNIFICADO de categorías cambia") + ": " +
                                   "; ".join(f"{k}: «{pv['subst_raw'][k]}» → «{vl[k]}»" for k in sorted(txt)))
                    nivel = max(nivel, "B" if sev else "C")
            elif tipo == "escala":
                o_now = {o for o in obs if o not in miss}
                if o_now != pv["obs"]:
                    cambios.append(f"valores observados cambian: {sorted(pv['obs'])} → {sorted(o_now)}")
                    nivel = "C"
            elif tipo == "abierta":
                add = {subst[k] for k in subst} - set(pv["subst"].values())
                rem = set(pv["subst"].values()) - {subst[k] for k in subst}
                reuse = [k for k in set(subst) & set(pv["subst"]) if not related(subst[k], pv["subst"][k])]
                if add or rem:
                    cambios.append(f"lista: {len(add)} etiquetas nuevas, {len(rem)} retiradas")
                if reuse:
                    cambios.append("CÓDIGOS REUTILIZADOS con otro significado: " +
                                   "; ".join(f"{k}: «{pv['subst_raw'][k]}» → «{vl[k]}»" for k in sorted(reuse, key=float)[:6]) +
                                   (" …" if len(reuse) > 6 else ""))
                    nivel = max(nivel, "B")   # no rompe la serie si se armoniza por etiqueta, pero obliga a hacerlo
        row["nivel_propuesto"] = nivel
        row["cambios"] = " | ".join(cambios)
        cw_rows.append(row)
        prev[cid] = {"lab": norm(labs[var]), "lab_raw": labs[var], "miss": miss, "subst": subst,
                     "subst_raw": {k: vl[k] for k in subst},
                     "obs": {o for o in obs if o not in miss}}

        # listas abiertas: código -> etiqueta
        if tipo == "abierta":
            lista = ("partidos" if cid in LISTAS_PARTIDO else "candidatos" if cid == "pref_presidente" else "problemas")
            for k, l in vl.items():
                lista_rows.append({"lista": lista, "concepto": cid, "mes": e["mes"], "estudio": c, "variable": var,
                                   "codigo": k, "etiqueta": l, "etiqueta_norm": norm(l),
                                   "es_no_respuesta": k in miss})

# ---------------------------------------------------------------- saltos de deff (cambio de ponderación)
prev_deff = None
for e in estudios:
    d = float(e["deff_kish"]) if e["deff_kish"] else None
    if prev_deff and d and d / prev_deff > 1.3:
        e["salto_deff"] = f"{prev_deff:.2f}→{d:.2f}"
    prev_deff = d or prev_deff

# ---------------------------------------------------------------- cambios de significado de códigos
code_hist = collections.defaultdict(list)   # (lista, concepto, codigo) -> [(mes, etiqueta_norm, etiqueta)]
for r in lista_rows:
    if r["concepto"] in ("intencion_voto", "recuerdo_voto", "pref_presidente", "prob_esp_1"):
        code_hist[(r["lista"], r["concepto"], r["codigo"])].append((r["mes"], r["etiqueta_norm"], r["etiqueta"]))
sig_rows = []
for (lista, cid, k), hist in code_hist.items():
    variants = collections.OrderedDict()
    for m, ln, l in sorted(hist):
        variants.setdefault(ln, [m, m, l])[1] = m
    if len(variants) < 2:
        continue
    keys = list(variants)
    cosmetic = all(related(keys[0], x) for x in keys[1:])
    sig_rows.append({"lista": lista, "concepto": cid, "codigo": k,
                     "tipo": "redacción/truncado" if cosmetic else "SIGNIFICADO DISTINTO",
                     "variantes": " || ".join(f"{v[2]} ({v[0]}…{v[1]})" for v in variants.values())})
sig_rows.sort(key=lambda r: (r["lista"], r["concepto"], r["tipo"] != "SIGNIFICADO DISTINTO", float(r["codigo"])))

# ---------------------------------------------------------------- partidos: etiquetas distintas
pe = collections.defaultdict(lambda: {"variantes": set(), "conceptos": set(), "codigos": set(), "meses": set()})
for r in lista_rows:
    if r["lista"] != "partidos" or r["es_no_respuesta"]:
        continue
    x = pe[r["etiqueta_norm"]]
    x["variantes"].add(r["etiqueta"]); x["conceptos"].add(r["concepto"]); x["codigos"].add(r["codigo"]); x["meses"].add(r["mes"])
part_rows = []
for ln, x in pe.items():
    part_rows.append({"etiqueta_norm": ln, "variantes": " | ".join(sorted(x["variantes"])),
                      "partido_armonizado_propuesto": partido_propuesto(ln), "partido_armonizado_revisado": "",
                      "codigos_usados": ";".join(sorted(x["codigos"], key=lambda s: float(s) if re.fullmatch(r"-?\d+", s) else 0)),
                      "primer_mes": min(x["meses"]), "ultimo_mes": max(x["meses"]), "n_meses": len(x["meses"]),
                      "conceptos": ";".join(sorted(x["conceptos"]))})
part_rows.sort(key=lambda r: (-r["n_meses"], r["etiqueta_norm"]))

# ---------------------------------------------------------------- matriz de cobertura
meses = [e["mes"] for e in estudios]
mat = collections.defaultdict(dict)
for r in cw_rows:
    mat[r["concepto"]][r["mes"]] = "—" if r["nivel_propuesto"] == "AUSENTE" else f"{r['variable']} [{r['nivel_propuesto']}]"
mat_rows = [{"concepto": cid, **{m: mat[cid].get(m, "") for m in meses}} for cid, *_ in CONCEPTOS]

# ---------------------------------------------------------------- escribir
def dump(name, rows, fields=None):
    fields = fields or list(dict.fromkeys(k for r in rows for k in r))
    with open(f"{OUT}/{name}", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

dump("conceptos.csv", [{"concepto": c[0], "bloque": c[1], "tipo": c[2], "descripcion": c[3],
                        "nombres_candidatos": ";".join(c[4]), "regex_etiqueta": c[5] or "", "ocurrencia": c[6]}
                       for c in CONCEPTOS])
for r in cw_rows:
    r["revisado"] = ""; r["nivel_final"] = ""; r["nota"] = ""
dump("crosswalk_borrador.csv", cw_rows,
     ["concepto", "mes", "estudio", "variable", "metodo", "etiqueta", "tipo", "n_validos", "n_categorias",
      "rango_observado", "codigos_missing", "nivel_propuesto", "cambios", "revisado", "nivel_final", "nota"])
dump("matriz_cobertura.csv", mat_rows, ["concepto"] + meses)
dump("lideres.csv", lider_rows)
dump("codigos_listas.csv", lista_rows)
dump("codigos_cambio_significado.csv", sig_rows)
dump("partidos_etiquetas.csv", part_rows)
dump("estudios.csv", estudios)

print("crosswalk:", len(cw_rows), "filas;", collections.Counter(r["nivel_propuesto"] for r in cw_rows))
print("lideres:", len(lider_rows), "| listas:", len(lista_rows), "| cambios significado:",
      collections.Counter(r["tipo"] for r in sig_rows), "| partidos distintos:", len(part_rows))
