"""Ficha técnica de cada barómetro (la del CIS), para la de «Construye tu estimación».

Lee el PDF de ficha técnica que trae cada ZIP (datos/docs/<estudio>/, extraído por scripts/00_extraer.py) y guarda
los apartados que pide el art. 69 de la LOREG: ámbito, universo, muestra, procedimiento de muestreo, error muestral
y fechas de campo. Uso (desde la raíz):  python3 estimacion/fichas_tecnicas.py   ->  estimacion/fichas_tecnicas.csv
"""
import csv, glob, os, re, subprocess, sys

APARTADOS = {
    "ambito": r"Ámbito", "universo": r"Universo", "muestra": r"Tamaño de la muestra", "afijacion": r"Afijación",
    "puntos": r"Puntos de muestreo", "procedimiento": r"Procedimiento de muestreo", "error": r"Error muestral",
    "fecha": r"Fecha de realización",
}
CORTE = r"(?m)^[\f ]*(Ámbito|Universo|Tamaño de la muestra|Afijación|Ponderación|Puntos de muestreo|Procedimiento de muestreo|Error muestral|Fecha de realización)\s*:"


def texto(pdf):
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout


def apartados(t):
    t = t.split("Muestra diseñada, realizada")[0]
    marcas = [(m.start(), m.end(), m.group(1)) for m in re.finditer(CORTE, t)]
    out = {}
    for i, (ini, fin, nombre) in enumerate(marcas):
        cuerpo = t[fin:marcas[i + 1][0] if i + 1 < len(marcas) else len(t)]
        cuerpo = re.sub(r"\s*\n\s*\d\s+Para más información.*", "", cuerpo, flags=re.S)
        cuerpo = re.sub(r"\s+", " ", cuerpo).strip()
        cuerpo = re.sub(r"(\D)\d(\s|$)", r"\1\2", cuerpo) if nombre == "Ponderación" else cuerpo
        clave = next((k for k, v in APARTADOS.items() if v == nombre), None)
        if clave:
            out[clave] = cuerpo
    return out


def main():
    filas = []
    for d in sorted(glob.glob("datos/docs/*/")):
        estudio = os.path.basename(os.path.dirname(d))
        pdfs = [f for f in os.listdir(d) if re.match(r"(?i)^(ft|ficha)", f) and f.lower().endswith(".pdf")]
        if not pdfs:
            print(f"  {estudio}: sin ficha técnica", file=sys.stderr)
            continue
        a = apartados(texto(os.path.join(d, pdfs[0])))
        falta = [k for k in APARTADOS if k not in a and k not in ("afijacion", "puntos")]
        if falta:
            print(f"  {estudio}: faltan {', '.join(falta)}", file=sys.stderr)
        filas.append({"estudio": estudio, **{k: a.get(k, "") for k in APARTADOS}})
    with open("estimacion/fichas_tecnicas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["estudio", *APARTADOS])
        w.writeheader()
        w.writerows(filas)
    print(f"fichas técnicas: {len(filas)} estudios")


main()
