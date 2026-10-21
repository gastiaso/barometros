"""Enunciado de cada concepto en el cuestionario de cada estudio y detección de cambios de redacción.

Salidas (inventario/):
  enunciados.csv            concepto x estudio: pregunta (libro de códigos), enunciado, versión, calidad de la extracción
  enunciados_versiones.csv  versiones distintas de cada enunciado, con su periodo
Uso: python scripts/04_enunciados.py <raíz del proyecto>   (requiere haber ejecutado 00, 02 y 03)
"""
import csv, difflib, json, os, re, sys, unicodedata, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.libro_codigos import parse
from lib.cuestionario import pregunta

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
INV = os.path.join(ROOT, "inventario")
DOCS = os.path.join(ROOT, "datos", "docs")

# conceptos sin pregunta propia en el cuestionario (derivados, muestrales o técnicos)
SIN_PREGUNTA = {"ccaa", "provincia", "tamuni", "tipo_telefono", "peso", "peso_ccaa", "intencion_voto_r",
                "recuerdo_votantes_r", "estudios", "clase_subjetiva", "voto_simpatia", "ocupacion_r", "sexo", "edad"}
# variable cuyo enunciado representa al concepto
VAR_PREGUNTA = {"recuerdo_voto": lambda r, s: "RECUVOTOG"}
MISMA_PREGUNTA = {"prob_esp_2": "prob_esp_1", "prob_esp_3": "prob_esp_1",
                  "prob_per_2": "prob_per_1", "prob_per_3": "prob_per_1"}


def norm_q(t):
    t = re.split(r"_{3,}", t)[0]
    t = t.split("?")[0] if "?" in t else t
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return re.sub(r"^(cambiando de tema|y)\s+", "", t)       # frases de transición que dependen del orden del cuestionario


def sim(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


cw = list(csv.DictReader(open(os.path.join(INV, "crosswalk_borrador.csv"), encoding="utf-8")))
var_of = {(r["concepto"], r["estudio"]): r["variable"] for r in cw}
libros, cues = {}, {}
rows = []
for r in cw:
    cid, c = r["concepto"], r["estudio"]
    if cid in SIN_PREGUNTA or not r["variable"]:
        continue
    base = MISMA_PREGUNTA.get(cid, cid)
    var = VAR_PREGUNTA[cid](r, c) if cid in VAR_PREGUNTA else var_of[(base, c)]
    if c not in libros:
        libros[c] = parse(os.path.join(DOCS, c, "codigo.txt"))
        cues[c] = open(os.path.join(DOCS, c, "cues.txt"), encoding="utf-8", errors="ignore").read().splitlines()
    e = libros[c].get(var, {})
    q = pregunta(cues[c], var, e.get("pregunta"))
    rows.append({"concepto": cid, "mes": r["mes"], "estudio": c, "variable": var, "pregunta": e.get("pregunta", ""),
                 "metodo": q["metodo"], "enunciado": q["texto"][:700], "_n": norm_q(q["texto"]),
                 "opciones_cuestionario": json.dumps(q["opciones"], ensure_ascii=False)})

# versiones por concepto
by = collections.defaultdict(list)
for x in rows:
    by[x["concepto"]].append(x)
vers_rows = []
for cid, xs in by.items():
    xs.sort(key=lambda x: x["mes"])
    versions = []                         # [(texto_norm, texto_original)]
    for x in xs:
        if not x["_n"]:
            x["version"], x["calidad"] = None, "sin_extraccion"
            continue
        vid = next((i for i, (t, _) in enumerate(versions) if sim(t, x["_n"]) >= 0.95), None)
        if vid is None:
            versions.append((x["_n"], x["enunciado"]))
            vid = len(versions) - 1
        x["version"], x["calidad"] = vid, "ok"
    # extracciones dudosas: versión que aparece una sola vez, muy distinta de la modal, con vecinos iguales entre sí
    cnt = collections.Counter(x["version"] for x in xs if x["version"] is not None)
    modal = cnt.most_common(1)[0][0] if cnt else None
    for i, x in enumerate(xs):
        if x["version"] is None:
            continue
        prev_v = next((y["version"] for y in reversed(xs[:i]) if y["version"] is not None and y["calidad"] == "ok"), None)
        next_v = next((y["version"] for y in xs[i + 1:] if y["version"] is not None), None)
        if cnt[x["version"]] == 1 and sim(x["_n"], versions[modal][0]) < 0.8 and (prev_v == next_v or next_v is None):
            x["calidad"] = "dudosa (texto de otra pregunta o filtro)"
            x["version"] = prev_v if prev_v is not None else modal
    for x in xs:
        if x["version"] is None:
            prev_v = next((y["version"] for y in reversed(xs[:xs.index(x)]) if y["version"] is not None), modal)
            x["version"] = prev_v
    # renumerar versiones por orden de aparición entre las extracciones válidas
    order, remap = [], {}
    for x in xs:
        if x["calidad"] == "ok" and x["version"] not in remap:
            remap[x["version"]] = len(order) + 1
            order.append(x["version"])
    prev = None
    for x in xs:
        x["version"] = remap.get(x["version"], x["version"])
        x["cambio_vs_anterior"] = "sí" if (prev is not None and x["version"] != prev) else ""
        prev = x["version"]
    for old, new in remap.items():
        ms = [x["mes"] for x in xs if x["version"] == new]
        vers_rows.append({"concepto": cid, "version": new, "desde": min(ms), "hasta": max(ms), "n_estudios": len(ms),
                          "enunciado": versions[old][1][:700]})

fields = ["concepto", "mes", "estudio", "variable", "pregunta", "metodo", "version", "cambio_vs_anterior", "calidad", "enunciado",
          "opciones_cuestionario"]
with open(os.path.join(INV, "enunciados.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    w.writerows(sorted(rows, key=lambda x: (x["concepto"], x["mes"])))
with open(os.path.join(INV, "enunciados_versiones.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["concepto", "version", "desde", "hasta", "n_estudios", "enunciado"])
    w.writeheader()
    w.writerows(sorted(vers_rows, key=lambda x: (x["concepto"], x["version"])))
print(len(rows), "enunciados;", collections.Counter(x["calidad"] for x in rows))
