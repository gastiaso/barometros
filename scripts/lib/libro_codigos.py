"""Parser de los libros de códigos del CIS (codigoXXXX.pdf -> pdftotext -layout).

parse(path) -> dict variable -> {"pregunta", "titulo", "items", "categorias": {codigo: etiqueta}, "codigo_aparte": bool}
Las variables de una batería (VAR_1, VAR_2, ...) comparten título y categorías; "items" recoge los
elementos «* A * B * C» del título, en orden. Las listas «(Código aparte)» se resuelven con los anexos
«P13 Título / Código Valor», emparejados por número de pregunta.
"""
import re

HDR = re.compile(r"^\s*(Estudio n\s*[º°o]|Pregunta\s+Variable)|^\s*P[áa]g\.?\s*\d+\s*$")
NAME = r"[A-Z][A-Z0-9_]*"
VAR = re.compile(rf"^\s{{0,10}}(\S{{1,14}})\s+((?:{NAME},\s*)*{NAME},?)\s+(\(\s*\d+(?:\s*-\s*\d+)?\s*\)(?:\s*a\s*\(\s*\d+(?:\s*-\s*\d+)?\s*\))?)\s*(.*)$")
VARCONT = re.compile(rf"^\s{{3,40}}((?:{NAME},\s*)*{NAME},?)(?:\s{{2,}}(.*))?$")
CAT = re.compile(r"^\s+(-?\d+(?:[.,]\d+)?)\s*\.-\s*(.*)$")
APX_HEAD = re.compile(r"^\s{0,4}(P\d+[A-Za-z0-9_]*)\s+(\S.*)$")
APX_ROW = re.compile(r"^\s{0,8}(-?\d+)\s{2,}(\S.*)$")


def _clean(s):
    return re.sub(r"\s+", " ", s).strip()


def parse(path):
    lines = [l for l in open(path, encoding="utf-8", errors="ignore").read().splitlines()]
    entries, order = {}, []
    apx, apx_order = {}, []
    cur = None
    state = None            # "names" mientras se leen nombres de variable en varias líneas
    last_cat = None
    in_apx = False
    apx_cur = None
    prev_nonempty = ""

    for i, raw in enumerate(lines):
        if HDR.match(raw):
            continue
        s = raw.strip()
        if not s:
            last_cat = None
            continue
        # ----- anexos de códigos
        if re.match(r"^C[óo]digo\s+Valor\s*$", s):
            in_apx = True
            m = APX_HEAD.match(prev_nonempty)
            if m and not re.match(r"^C[óo]digo", prev_nonempty.strip()):
                key = m.group(1)
                apx_cur = {"titulo": _clean(m.group(2)), "categorias": {}}
                apx[key] = apx_cur
                apx_order.append(key)
            elif prev_nonempty and not APX_ROW.match(prev_nonempty) and not re.match(r"^C[óo]digo", prev_nonempty.strip()):
                apx_cur = {"titulo": _clean(prev_nonempty), "categorias": {}}
                apx["_" + _clean(prev_nonempty)] = apx_cur
            prev_nonempty = raw
            continue
        if in_apx:
            r = APX_ROW.match(raw)
            if r and apx_cur is not None:
                apx_cur["categorias"][r.group(1)] = _clean(r.group(2))
                apx_cur["_last"] = r.group(1)
            elif apx_cur is not None and apx_cur.get("_last") and raw.startswith(" " * 6) and not APX_HEAD.match(raw):
                apx_cur["categorias"][apx_cur["_last"]] += " " + s      # etiqueta partida
            prev_nonempty = raw
            continue
        # ----- cuerpo principal
        m = VAR.match(raw)
        if m:
            preg, names, cols, title = m.groups()
            vars_ = [n.strip() for n in names.split(",") if n.strip()]
            cur = {"pregunta": preg, "columnas": _clean(cols), "titulo": title.strip(), "categorias": {},
                   "codigo_aparte": False, "vars": vars_}
            order.append(cur)
            state = "names" if names.rstrip().endswith(",") else None
            last_cat = None
            prev_nonempty = raw
            continue
        if cur is None:
            prev_nonempty = raw
            continue
        if state == "names":
            mc = VARCONT.match(raw)
            if mc:
                more, rest = mc.groups()
                cur["vars"] += [n.strip() for n in more.split(",") if n.strip()]
                if rest:
                    c = CAT.match(" " + rest)
                    if c:
                        cur["categorias"][c.group(1)] = c.group(2).strip(); last_cat = c.group(1)
                    elif rest.strip().startswith("(Código aparte)"):
                        cur["codigo_aparte"] = True
                    else:
                        cur["titulo"] += " " + rest.strip()
                state = "names" if more.rstrip().endswith(",") else None
                prev_nonempty = raw
                continue
            state = None
        c = CAT.match(raw)
        if c:
            code, lab = c.groups()
            code = code.replace(",", ".")
            if re.fullmatch(r"-?\d+\.0+", code):
                code = code.split(".")[0]
            cur["categorias"][code] = lab.strip()
            last_cat = code
        elif s.startswith("(Código aparte)"):
            cur["codigo_aparte"] = True
        elif last_cat is not None:
            cur["categorias"][last_cat] += " " + s
        elif not cur["categorias"]:
            cur["titulo"] += " " + s
        prev_nonempty = raw

    out = {}
    for e in order:
        title = _clean(e["titulo"])
        items = [x.strip() for x in re.findall(r"\*\s*([^*]+?)\s*(?=\*|$)", title)] if "*" in title else []
        base = _clean(title.split("*")[0]) if items else title
        cats = {k: _clean(v) for k, v in e["categorias"].items()}
        if e["codigo_aparte"] and not cats:
            a = apx.get(e["pregunta"])
            if a:
                cats = dict(a["categorias"])
        for v in e["vars"]:
            out[v] = {"pregunta": e["pregunta"], "titulo": base, "titulo_completo": title, "items": items,
                      "categorias": cats, "codigo_aparte": e["codigo_aparte"]}
    return out


if __name__ == "__main__":
    import sys, json
    d = parse(sys.argv[1])
    for v in sys.argv[2:]:
        print(v, json.dumps(d.get(v), ensure_ascii=False)[:700])
    print(len(d), "variables")
