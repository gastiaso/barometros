"""Revisión del crosswalk contra cuestionarios y libros de códigos, y tablas de armonización de listas abiertas.

Entradas (inventario/): crosswalk_borrador.csv, enunciados.csv, decisiones_manuales.csv, codigos_listas.csv,
                        codigos_cambio_significado.csv, partidos_etiquetas.csv
Salidas (inventario/):
  crosswalk_revisado.csv     borrador + nivel_final (A/B/C/AUSENTE), revisado (auto/manual) y nota
  mapa_partidos.csv          estudio x variable x código -> partido armonizado (sin fusionar marcas distintas)
  partidos_armonizados.csv   etiqueta de partido -> id armonizado, con nota
  mapa_problemas.csv         estudio x código -> problema armonizado (por etiqueta)
  mapa_candidatos.csv        estudio x código -> candidato (PREFPTE)
  codigos_cambio_significado_revisado.csv  + verificación en libro de códigos / cuestionario y resolución
Uso: python scripts/05_revision.py <raíz del proyecto>
"""
import csv, json, os, re, sys, unicodedata, collections, difflib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.libro_codigos import parse

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
INV = os.path.join(ROOT, "inventario")
DOCS = os.path.join(ROOT, "datos", "docs")
rd = lambda n: list(csv.DictReader(open(os.path.join(INV, n), encoding="utf-8")))


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(no leer\)|\[recodificad[ao]\]", "", s)
    return re.sub(r"[^a-z0-9+]+", " ", s).strip()


def dump(name, rows, fields=None):
    fields = fields or list(dict.fromkeys(k for r in rows for k in r))
    with open(os.path.join(INV, name), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


# ============================================================ 1. crosswalk revisado
cw = rd("crosswalk_borrador.csv")
en = {(e["concepto"], e["estudio"]): e for e in rd("enunciados.csv")}
ver_txt = {(v["concepto"], v["version"]): v["enunciado"] for v in rd("enunciados_versiones.csv")}
man = {(m["concepto"], m["estudio"]): m for m in rd("decisiones_manuales.csv")}

for r in cw:
    key = (r["concepto"], r["estudio"])
    ch = r["cambios"]
    e = en.get(key)
    notas, nivel = [], "A"
    if r["nivel_propuesto"] == "AUSENTE":
        nivel = "AUSENTE"
    else:
        cat = r["tipo"] in ("cerrada", "escala") and ("categorías +" in ch or "categorías -" in ch or "SIGNIFICADO" in ch
                                                      or "valores observados" in ch)
        if cat:
            nivel = "C"; notas.append("Cambian las categorías de respuesta.")
        if e and e["cambio_vs_anterior"] == "sí":
            v = int(e["version"])
            nivel = max(nivel, "B") if nivel != "C" else nivel
            notas.append(f"Cambia el enunciado en el cuestionario (v{v - 1} → v{v}): «{ver_txt.get((r['concepto'], str(v)), '')[:160]}».")
        if "códigos de no respuesta" in ch:
            m = re.search(r"códigos de no respuesta cambian: \[(.*?)\] → \[(.*?)\]", ch)
            a = set(re.findall(r"'(-?\d+)'", m.group(1))) if m else set()
            b = set(re.findall(r"'(-?\d+)'", m.group(2))) if m else set()
            if (a ^ b) <= {"-99", "0"}:
                notas.append("Solo aparece o desaparece la etiqueta del código técnico N.P. (-99/0); NS/NC no cambian.")
            else:
                nivel = "B" if nivel == "A" else nivel
                notas.append(f"Regla técnica: tomar los códigos de no respuesta de cada estudio ({r['codigos_missing']}).")
        if "REUTILIZADOS" in ch:
            nivel = "B" if nivel == "A" else nivel
            notas.append("Códigos reutilizados con otro significado: armonizar por etiqueta con la tabla correspondiente (mapa_partidos / mapa_problemas / mapa_candidatos), nunca por código.")
        elif "lista:" in ch:
            notas.append("Lista abierta con altas o bajas de opciones: se armoniza por etiqueta; no afecta a la comparabilidad.")
        if not notas and ("redacción de categorías" in ch or "enunciado cambia" in ch):
            notas.append("Solo cambia el texto de las etiquetas del .sav; el enunciado del cuestionario y los códigos son los mismos.")
        if not notas and "nombre distinto" in ch:
            notas.append("Solo cambia el nombre de la variable.")
    if key in man:
        nivel = man[key]["nivel_final"]
        notas = [man[key]["nota"]]
        rev = "manual"
    elif e and e["calidad"] == "ok":
        rev = "auto: cuestionario + .sav"
    elif r["nivel_propuesto"] == "AUSENTE":
        rev = "pendiente"
    else:
        rev = "auto: .sav" + (" (enunciado no extraído)" if e else "")
    r["nivel_final"], r["revisado"], r["nota"] = nivel, rev, " ".join(notas)
    r["enunciado_version"] = e["version"] if e else ""

dump("crosswalk_revisado.csv", cw,
     ["concepto", "mes", "estudio", "variable", "metodo", "etiqueta", "tipo", "n_validos", "n_categorias",
      "rango_observado", "codigos_missing", "enunciado_version", "nivel_propuesto", "cambios", "nivel_final", "revisado", "nota"])

# ============================================================ 2. partidos
MANUAL_PARTIDOS = {
    "psoe": "PSOE", "pp": "PP", "vox": "VOX", "ciudadanos": "CS", "c s": "CS", "podemos": "PODEMOS",
    "unidas podemos": "UNIDAS_PODEMOS", "up": "UNIDAS_PODEMOS", "podemos iu av": "PODEMOS_IU_AV",
    "sumar": "SUMAR", "movimiento sumar": "SUMAR", "mas pais": "MAS_PAIS", "compromis": "COMPROMIS",
    "mes compromis": "MES_COMPROMIS", "erc": "ERC", "jxcat": "JUNTS", "junts": "JUNTS", "eh bildu": "EH_BILDU",
    "eaj pnv": "PNV", "bng": "BNG", "cup": "CUP", "cc pnc": "CC", "cca pnc": "CC", "cca": "CC",
    "nueva canarias": "NUEVA_CANARIAS", "upn": "UPN", "na+": "NA_SUMA", "teruel existe": "TERUEL_EXISTE",
    "en comu podem": "EN_COMU_PODEM", "en comun unidas podemos": "EN_COMUN_UP", "en comun up": "EN_COMUN_UP",
    "compromiso por galicia": "COMPROMISO_POR_GALICIA", "compromiso por pais vasco": "COMPROMISO_POR_GALICIA",
    "compromiso por galiza": "COMPROMISO_POR_GALICIA", "se acabo la fiesta": "SALF", "pacma": "PACMA", "iu": "IU",
    "equo": "VERDES_EQUO", "verdes equo": "VERDES_EQUO", "escanos en blanco": "ESCANOS_EN_BLANCO",
    "en blanco": "BLANCO", "nulo": "NULO", "voto nulo": "NULO", "no votaria": "NO_VOTARIA", "no voto": "NO_VOTO",
    "no tenia edad": "NO_TENIA_EDAD", "no tenia derecho a voto": "SIN_DERECHO_VOTO", "ninguno": "NINGUNO",
    "otro partido": "OTRO", "otros partidos": "OTRO",
    "no votaria a ningun otro partido cita el mismo partido": "NINGUN_OTRO", "no votaria a ningun otro partido cita el mismo pa": "NINGUN_OTRO",
}
NOTAS_PARTIDOS = {
    "PODEMOS_IU_AV": "Etiqueta que usa el CIS para el código 4 solo en dic-2025 y ene-2026 (antes y después, «Unidas Podemos»). Se mantiene separada por criterio de no fusionar marcas.",
    "SUMAR": "El código 21 alterna entre «Sumar» y «Movimiento Sumar» de un mes a otro (2023-06 a 2024-02): misma opción, etiqueta distinta.",
    "JUNTS": "«JxCat» y «Junts» designan el mismo partido (Junts per Catalunya); el código 902 alterna ambas etiquetas.",
    "COMPROMISO_POR_GALICIA": "Errata del CIS: en algunos meses el libro de códigos y el .sav dicen «Compromiso por País Vasco» o «Galiza» para el mismo código 1205.",
    "CC": "Variantes de Coalición Canaria (CC-PNC, CCa-PNC, CCa).",
    "VERDES_EQUO": "Equo pasa a llamarse Verdes Equo; el código 11 alterna ambas etiquetas.",
    "NA_SUMA": "Navarra Suma (coalición de 2019), distinta de UPN.",
    "NO_VOTA_NINGUNO": "Solo en voto + simpatía (VOTOSIMG): el código 97/997/9997 se etiqueta «No votaría» hasta abr-2024 y «Ninguno» desde may-2024, sin salto en la serie (10,0 % y 10,6 %).",
}
MANUAL_PARTIDOS["voto blanco"] = "BLANCO"           # «Voto blanco» (3307, INTENCIONGR) = «En blanco»
NOTAS_PARTIDOS["BLANCO"] = "«En blanco» y «Voto blanco» (solo 3307, INTENCIONGR) son la misma opción."
# Partidos cuya etiqueta cambia con la renumeración de oct-2022 (R06) u otra variante del CIS: misma opción.
# «PNC» es el Partido Nacionalista Catalán (códigos 72 y 911); en 3405 (INTENCIONG, código 504) es el Canario
# (codigos_sin_etiqueta.csv). «EXISTE» (código 207, desde 2025) es otra opción y no se une a Teruel Existe.
MANUAL_PARTIDOS.update({
    "pr+": "PARTIDO_RIOJANO", "partido riojano": "PARTIDO_RIOJANO",
    "pi": "PI_PROPOSTA_PER_LES_ILLES", "pi proposta per les illes": "PI_PROPOSTA_PER_LES_ILLES",
    "convergencia": "CDC", "cdc": "CDC",
    "pnc": "PNC_CATALAN", "pnc partido nacionalista catalan": "PNC_CATALAN",
    "pnc partido nacionalista canario": "PNC_CANARIO",
    "som valencians": "SOM_VALENCIANS", "soms valencians": "SOM_VALENCIANS",
    "pcas tc rc": "PCAS_TC", "partido castellano tierra comunera": "PCAS_TC",
    "partido castellano tierra comunera recortes cero": "PCAS_TC",
    "drago canarias verdes": "DRAGO_CANARIAS_VERDES", "drago verdes canarias": "DRAGO_CANARIAS_VERDES",
    "frente obreo": "FRENTE_OBRERO", "adelante": "ADELANTE_ANDALUCIA", "existe teruel existe": "TERUEL_EXISTE",
})
NOTAS_PARTIDOS.update({
    "PARTIDO_RIOJANO": "«PR+» hasta sep-2022 y «Partido Riojano» desde oct-2022.",
    "PI_PROPOSTA_PER_LES_ILLES": "«PI» hasta sep-2022 y «PI (Proposta per les Illes)» desde oct-2022.",
    "CDC": "«Convergència» hasta sep-2022 y «CDC» desde oct-2022.",
    "PNC_CATALAN": "Partido Nacionalista Catalán: «PNC (Partido Nacionalista Catalán)» o «PNC» (códigos 72 y 911).",
    "PNC_CANARIO": "Partido Nacionalista Canario (código 504); en 3405, INTENCIONG lo etiqueta «PNC».",
    "SOM_VALENCIANS": "«Som Valencians» hasta sep-2022; «Soms Valencians» desde oct-2022 (errata).",
    "PCAS_TC": "Variantes de Partido Castellano-Tierra Comunera (PCAS-TC-RC, con o sin «Recortes Cero»).",
    "DRAGO_CANARIAS_VERDES": "«Drago Verdes Canarias» y «Drago Canarias Verdes»: mismo código 506.",
    "FRENTE_OBRERO": "«Frente Obreo» (ene-2025) es errata de «Frente Obrero».",
    "ADELANTE_ANDALUCIA": "«Adelante» (código 101, may-2023 y jul-2023) es Adelante Andalucía.",
    "TERUEL_EXISTE": "«Teruel Existe», «Existe (Teruel Existe)» y, en 3413 (INTENCIONGR y VOTOSIMG), «Existe»: código 202.",
})


def no_respuesta(etiqueta, codigo):
    """Tipo de no respuesta. Se distinguen porque cambian la base: NP (no procede, filtro) se excluye del total;
    NS, NC y NR (no recuerda) son respuestas del entrevistado y cuentan en la base.
    El código 0 (y -99) es siempre «no procede»: en 3502 (INTENCIONGALTER) el CIS lo etiqueta «N.C.» por error
    (1.205 casos, los entrevistados que no reciben la pregunta)."""
    if codigo in ("0", "-99"):
        return "NP"
    e = unicodedata.normalize("NFKD", etiqueta).encode("ascii", "ignore").decode().lower()
    if re.match(r"^\s*(n\.?\s*p\b|no procede)", e):
        return "NP"
    if re.match(r"^\s*(n\.?\s*r\b|no recuerda)", e):
        return "NR"
    if re.match(r"^\s*(n\.?\s*s\b|no sabe)", e):
        return "NS"
    return "NC"


REGIONALES_PSOE = r"^(psc|pspv|psdeg|psib|psn)"
mpart = {}
pe = rd("partidos_etiquetas.csv")
for p in pe:
    ln = p["etiqueta_norm"]
    pid = MANUAL_PARTIDOS.get(ln)
    if not pid and re.match(r"^marea galeguista", ln):
        pid = "MAREA_GALEGUISTA"
    if not pid:
        pid = re.sub(r"[^A-Z0-9]+", "_", ln.upper()).strip("_")[:40]
    p["partido_armonizado_revisado"] = pid
    p["nota"] = NOTAS_PARTIDOS.get(pid, "")
    mpart[ln] = pid
dump("partidos_armonizados.csv", pe, ["etiqueta_norm", "variantes", "partido_armonizado_revisado", "nota", "codigos_usados",
                                      "primer_mes", "ultimo_mes", "n_meses", "conceptos"])

listas = rd("codigos_listas.csv")
mp = []
for r in listas:
    if r["lista"] != "partidos":
        continue
    nr = r["es_no_respuesta"] == "True"
    pid = mpart.get(r["etiqueta_norm"]) if not nr else no_respuesta(r["etiqueta"], r["codigo"])
    if r["concepto"] == "voto_simpatia" and pid in ("NO_VOTARIA", "NINGUNO"):
        pid = "NO_VOTA_NINGUNO"      # VOTOSIMG: el código x997 pasa de «No votaría» a «Ninguno» en may-2024 (misma categoría)
    mp.append({"estudio": r["estudio"], "mes": r["mes"], "concepto": r["concepto"], "variable": r["variable"],
               "codigo": r["codigo"], "etiqueta": r["etiqueta"], "partido_armonizado": pid or "", "es_no_respuesta": nr})
dump("mapa_partidos.csv", mp)

# ============================================================ 3. problemas y candidatos (por etiqueta)
def related(a, b):
    """Misma categoría con otra redacción: truncado (prefijo), mismas palabras en otro orden o casi idéntica."""
    if a == b or a.startswith(b) or b.startswith(a) or set(a.split()) == set(b.split()):
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.94


# Códigos de problema cuyo significado cambia (dic-2025): no se unen por código.
SPLIT_CODIGOS = {"problemas": {"90", "91", "93", "95"}}
NOTAS_PROBLEMAS = {
    "33": "El código 33 amplía su alcance en mar-2022: de «Los recortes» a «La falta de servicios públicos. Los recortes» (dic-2025: «La falta de recursos para los servicios públicos…»).",
    "73": "Categoría «Catástrofes naturales»: el ejemplo cambia de «el volcán de La Palma» a «crisis de la DANA» en nov-2024.",
}


def agrupa(lista, conceptos):
    """Une etiquetas en categorías armonizadas: por similitud de etiqueta y, en problemas, por código estable
    (salvo los códigos de SPLIT_CODIGOS). Unión-búsqueda sobre etiquetas normalizadas."""
    labs, last = collections.OrderedDict(), {}
    by_code = collections.defaultdict(set)
    for r in listas:
        if r["lista"] == lista and r["concepto"] in conceptos and r["es_no_respuesta"] != "True":
            labs.setdefault(r["etiqueta_norm"], r["etiqueta"])
            if r["mes"] >= last.get(r["etiqueta_norm"], ("", ""))[0]:
                last[r["etiqueta_norm"]] = (r["mes"], r["etiqueta"])
            by_code[r["codigo"]].add(r["etiqueta_norm"])
    parent = {k: k for k in labs}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        parent[find(a)] = find(b)
    keys = list(labs)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if related(a, b):
                union(a, b)
    if lista == "problemas":
        for code, ls in by_code.items():
            if code in SPLIT_CODIGOS["problemas"]:
                continue
            ls = list(ls)
            for b in ls[1:]:
                union(ls[0], b)
    groups = collections.defaultdict(list)
    for k in keys:
        groups[find(k)].append(k)
    ids, codes_of = {}, collections.defaultdict(set)
    for code, ls in by_code.items():
        for l in ls:
            codes_of[l].add(code)
    for i, (root, members) in enumerate(sorted(groups.items(), key=lambda g: min(int(c) if c.lstrip("-").isdigit() else 9999 for m in g[1] for c in codes_of[m]))):
        base = max((last[m] for m in members))[1]          # etiqueta más reciente
        nota = " ".join(sorted({NOTAS_PROBLEMAS.get(c, "") for m in members for c in codes_of[m]} - {""})) if lista == "problemas" else ""
        for m in members:
            ids[m] = (f"{lista[:4].upper()}_{i + 1:03d}", base, len(members) > 1, nota)
    return ids


for lista, conceptos, out in (("problemas", {"prob_esp_1", "prob_esp_2", "prob_esp_3", "prob_per_1", "prob_per_2", "prob_per_3"}, "mapa_problemas.csv"),
                              ("candidatos", {"pref_presidente"}, "mapa_candidatos.csv")):
    ids = agrupa(lista, conceptos)
    rows, seen = [], set()
    for r in listas:
        if r["lista"] != lista or r["concepto"] not in conceptos:
            continue
        k = (r["estudio"], r["codigo"], r["variable"] if lista == "candidatos" else r["concepto"][:8])
        if k in seen:
            continue
        seen.add(k)
        nr = r["es_no_respuesta"] == "True"
        i = ids.get(r["etiqueta_norm"], ("NC", "", False, "")) if not nr else (no_respuesta(r["etiqueta"], r["codigo"]), "", False, "")
        rows.append({"estudio": r["estudio"], "mes": r["mes"], "bloque": r["concepto"][:8] if lista == "problemas" else "pref_presidente",
                     "codigo": r["codigo"], "etiqueta": r["etiqueta"], "id_armonizado": i[0],
                     "etiqueta_armonizada": i[1] or r["etiqueta"], "agrupa_variantes": i[2], "nota": i[3]})
    dump(out, rows)

# ============================================================ 4. códigos con cambio de significado: verificación
libros = {}
def libro(c):
    if c not in libros:
        libros[c] = parse(os.path.join(DOCS, c, "codigo.txt"))
    return libros[c]

est_by_mes = {}
for r in listas:
    est_by_mes[r["mes"]] = r["estudio"]
VAR = {"intencion_voto": "INTENCIONG", "recuerdo_voto": "RECUERDO", "pref_presidente": "PREFPTE", "prob_esp_1": "PESPANNA1"}
sig = rd("codigos_cambio_significado.csv")
for s in sig:
    checks = []
    for m in re.finditer(r"(.+?) \((\d{4}-\d{2})…(\d{4}-\d{2})\)(?: \|\| |$)", s["variantes"]):
        lab, desde = m.group(1).strip(), m.group(2)
        c = est_by_mes.get(desde)
        cats = libro(c).get(VAR[s["concepto"]], {}).get("categorias", {}) if c else {}
        lb = cats.get(s["codigo"])
        fuente = "libro"
        if lb is None and c:
            e = en.get((s["concepto"], c))
            opts = json.loads(e["opciones_cuestionario"]) if e and e.get("opciones_cuestionario") else {}
            lb, fuente = opts.get(s["codigo"]), "cuestionario"
        if lb is None:
            checks.append(f"{desde}: sin lista en libro ni cuestionario")
        else:
            ok = norm(lb) == norm(lab) or related(norm(lb), norm(lab)) or norm(lab) in norm(lb) or norm(lb) in norm(lab)
            checks.append(f"{desde}: {fuente} {'coincide' if ok else 'DIFIERE («' + lb + '»)'}")
    s["verificacion"] = "; ".join(checks)
    if s["concepto"] in ("intencion_voto", "recuerdo_voto") and s["codigo"] in [str(i) for i in range(1, 31)] + ["4", "6", "7", "21"] and "2022-10" in s["variantes"]:
        s["resolucion"] = "Renumeración de la lista de partidos en oct-2022 (confirmada en el cuestionario de 3380). Armonizar por etiqueta."
    elif s["codigo"] in ("1205", "1211"):
        s["resolucion"] = "Errata del CIS (Galicia / Galiza / País Vasco) en la etiqueta del mismo partido gallego. Armonizar como un solo partido."
    elif s["tipo"] == "redacción/truncado":
        s["resolucion"] = "Variante de redacción o truncado de la misma categoría. Sin efecto."
    else:
        s["resolucion"] = "El código cambia de significado. Armonizar por etiqueta; la serie de cada etiqueta empieza o acaba donde corresponda."
dump("codigos_cambio_significado_revisado.csv", sig)

print("crosswalk_revisado:", collections.Counter(r["nivel_final"] for r in cw), collections.Counter(r["revisado"] for r in cw))
print("partidos:", len(pe), "etiquetas ->", len(set(mpart.values())), "ids")
