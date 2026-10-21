"""Extracción del enunciado y las opciones de respuesta de una pregunta en los cuestionarios del CIS
(cuesXXXX.pdf -> pdftotext sin -layout).

pregunta(lines, var, preg) -> {"texto": str, "opciones": {codigo: etiqueta}, "metodo": "etiqueta"|"numero"|""}
"""
import re

START = re.compile(r"^\f?\s*([PCA])(?:\.\s*(\d+[A-Za-z0-9_]*)|(\d+[A-Za-z0-9_]*)\.)\s*(.*)$")
OPT = re.compile(r"^\s*(.*?\S)\s*\.{3,}\s*(-?\d+)\s*$")
TAG = re.compile(r"\[([A-Z][A-Z0-9_]*)\]")


def _is_start(l):
    m = START.match(l)
    if not m:
        return None
    rest = (m.group(4) or "").strip().lower()
    if rest.startswith("si ") or rest.startswith("=") or rest.startswith("ir a"):
        return None                       # línea de filtro, no inicio de pregunta
    return m


def _num(preg):
    m = re.match(r"^([PCA])(\d+[A-Za-z0-9_]*)$", preg or "")
    return (m.group(1) + m.group(2)).lower() if m else None


def pregunta(lines, var, preg=None):
    idx_tag = next((i for i, l in enumerate(lines) if l.strip().startswith(f"[{var}]")), None)
    if idx_tag is None:
        idx_tag = next((i for i, l in enumerate(lines) if f"[{var}]" in l and "ir a" not in l.lower()), None)
    start = None
    metodo = ""
    if idx_tag is not None:
        for j in range(idx_tag, max(-1, idx_tag - 40), -1):
            if _is_start(lines[j]):
                start = j
                break
        metodo = "etiqueta"
    if start is None and preg:
        n = _num(preg)
        if n:
            for j, l in enumerate(lines):
                m = _is_start(l)
                if m and (m.group(1) + (m.group(2) or m.group(3))).lower() == n:
                    start = j
                    metodo = "numero"
                    break
    if start is None:
        return {"texto": "", "opciones": {}, "metodo": ""}
    texto, opciones = [], {}
    end = idx_tag if (idx_tag is not None and idx_tag > start) else None
    j = start
    while j < len(lines):
        l = lines[j]
        if j > start and _is_start(l):
            break
        if end is not None and j == end:
            j += 1
            break
        if OPT.match(l):
            break
        if l.strip().lower().startswith("filtro"):
            break
        texto.append(l.strip())
        j += 1
    # opciones a partir de j
    k = j
    blank = 0
    while k < len(lines) and k < j + 120:
        l = lines[k]
        if _is_start(l):
            break
        m = OPT.match(l)
        if m:
            opciones[m.group(2)] = re.sub(r"\s+", " ", m.group(1)).strip()
            blank = 0
        elif not l.strip():
            blank += 1
            if blank >= 3 and opciones:
                break
        k += 1
    t = re.sub(r"\s+", " ", " ".join(texto)).strip()
    t = re.sub(r"^[PCA]\.?\s*\d+[A-Za-z0-9_]*\.?\s*", "", t)
    t = TAG.sub("", t)
    t = re.sub(r"\((?:CATEGOR[ÍI]A|NUM[ÉE]RICA|RESPUESTA|ENTREVISTADOR)[^)]*\)", "", t, flags=re.I)
    return {"texto": re.sub(r"\s+", " ", t).strip(), "opciones": opciones, "metodo": metodo}
