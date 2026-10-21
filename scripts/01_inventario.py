"""Inventario de variables de los barómetros CIS (ene 2021 - oct 2026).

Salidas (en OUT):
  estudios.csv            una fila por estudio: mes, código, n, nº variables, variable de peso, etiqueta, deff Kish
  variables_por_estudio.csv  una fila por estudio x variable: nombre, etiqueta, nº categorías, etiquetas de valor (JSON),
                             firma de categorías (hash) para detectar cambios
"""
import csv, glob, hashlib, json, os, sys
import pyreadstat

S = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.join(S, "inventario")
os.makedirs(OUT, exist_ok=True)
inv = list(csv.DictReader(open(f"{S}/inventario/barometros_2021_2026.csv", encoding="utf-8")))

est_rows, var_rows = [], []
for r in inv:
    c = r["estudio"]
    sav = [p for p in glob.glob(f"{S}/datos/extract/{c}/*") if p.lower().endswith(".sav")][0]
    _, meta = pyreadstat.read_sav(sav, metadataonly=True)
    names = meta.column_names
    labels = meta.column_names_to_labels
    vl = meta.variable_value_labels
    # weight: prefer PESO, else first PESO* that is not PESOCCAA
    wcands = [v for v in names if v.upper().startswith("PESO") and v.upper() != "PESOCCAA"]
    wvar = "PESO" if "PESO" in names else (wcands[0] if wcands else "")
    deff = ""
    if wvar:
        df, _ = pyreadstat.read_sav(sav, usecols=[wvar])
        w = df[wvar].dropna()
        deff = round(len(w) * (w ** 2).sum() / w.sum() ** 2, 3)
    est_rows.append({
        "mes": r["mes"], "estudio": c, "titulo": r["titulo"], "n": meta.number_rows,
        "n_variables": len(names), "var_peso": wvar, "etiqueta_peso": labels.get(wvar, "") or "",
        "deff_kish": deff, "otros_pesos": ";".join(v for v in names if v.upper().startswith("PESO") and v != wvar),
    })
    for i, v in enumerate(names):
        cats = vl.get(v, {})
        cats_norm = {str(int(k)) if isinstance(k, float) and k.is_integer() else str(k): str(l).strip() for k, l in cats.items()}
        firma = hashlib.md5(json.dumps(sorted(cats_norm.items()), ensure_ascii=False).encode()).hexdigest()[:10] if cats_norm else ""
        var_rows.append({
            "mes": r["mes"], "estudio": c, "orden": i + 1, "variable": v,
            "etiqueta": (labels.get(v) or "").strip(), "n_categorias": len(cats_norm),
            "firma_categorias": firma, "categorias_json": json.dumps(cats_norm, ensure_ascii=False),
        })

def dump(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

dump(f"{OUT}/estudios.csv", est_rows)
dump(f"{OUT}/variables_por_estudio.csv", var_rows)
print(len(est_rows), "estudios;", len(var_rows), "filas estudio x variable")
