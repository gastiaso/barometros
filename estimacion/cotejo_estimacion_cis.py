"""Segunda transcripción de la estimación publicada por el CIS, independiente de la primera.

Lee la tabla «Estimación de voto CIS (en % sobre el voto válido)» de la nota de estimación de cada barómetro (texto
extraído con pdftotext) y la coteja con estimacion/estimacion_cis.csv, fila a fila y en el mismo orden.
Uso (desde la raíz):  python3 estimacion/cotejo_estimacion_cis.py <carpeta con estimacion_<estudio>.pdf>
Escribe estimacion/cotejo_estimacion_cis.csv (una fila por candidatura) e imprime las discrepancias.
"""
import csv, os, re, subprocess, sys

NUM = re.compile(r"(?<![\w±])(\d{1,2}(?:,\d{1,2})?)(?![\w,])")
FIN = re.compile(r"^\s*(Voto nulo|Abstención|No sabe|No contesta|\(N\))")


def tabla(pdf):
    t = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    lineas = t.splitlines()
    # cabecera de la tabla: la línea que acaba en «válido)», justo después de «Voto directo»
    ini = next(i for i, l in enumerate(lineas) if "válido)" in l and any("Voto directo" in x for x in lineas[max(0, i - 10):i]))
    filas, pendiente, suelto = [], "", None
    for l in lineas[ini + 1:]:
        if FIN.match(l):
            break
        if not l.strip() or re.match(r"^\s*(censo\)|\(en % sobre)", l):
            continue
        sin_margen = re.sub(r"±\s*\d+(,\d+)?", " ", l)
        nums = NUM.findall(sin_margen)
        texto = NUM.sub(" ", sin_margen).strip()
        if len(nums) == 1 and not texto:           # cifra suelta (el voto directo, desplazado a la línea anterior)
            suelto = nums[-1]
            continue
        if len(nums) >= 2 or (len(nums) == 1 and suelto is not None):
            etiqueta = re.sub(r"\s+", " ", (pendiente + " " + texto).strip())
            filas.append([etiqueta, float(nums[-1].replace(",", "."))])
            pendiente, suelto = "", None
        elif filas and texto.startswith("(") and not nums and pendiente == "":
            filas[-1][0] += " " + texto          # resto de una etiqueta de varias líneas
        else:
            pendiente = (pendiente + " " + texto).strip()
    return filas


def main(carpeta):
    pub = {}
    with open("estimacion/estimacion_cis.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pub.setdefault(r["estudio"], []).append(r)
    salida, problemas = [], []
    for estudio, filas_pub in pub.items():
        pdf = os.path.join(carpeta, f"estimacion_{estudio}.pdf")
        try:
            leidas = tabla(pdf)
        except Exception as e:                      # noqa: BLE001
            problemas.append(f"{estudio}: no se pudo leer la tabla ({e})")
            continue
        if len(leidas) != len(filas_pub):
            problemas.append(f"{estudio}: {len(leidas)} filas en el PDF y {len(filas_pub)} en la transcripción")
        for i, r in enumerate(filas_pub):
            et_pdf, v_pdf = leidas[i] if i < len(leidas) else ("", None)
            v = float(r["estimacion"])
            ok = v_pdf is not None and abs(v - v_pdf) < 1e-9
            salida.append({"estudio": estudio, "mes": r["mes"], "partido": r["partido"], "etiqueta_cis": r["etiqueta_cis"],
                           "estimacion": r["estimacion"], "etiqueta_pdf": et_pdf, "estimacion_pdf": v_pdf, "coincide": ok})
            if not ok:
                problemas.append(f"{estudio} {r['partido']}: transcripción {v}, PDF {v_pdf} ({et_pdf})")
    with open("estimacion/cotejo_estimacion_cis.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(salida[0]))
        w.writeheader()
        w.writerows(salida)
    n_ok = sum(s["coincide"] for s in salida)
    print(f"Cotejo: {n_ok} de {len(salida)} cifras coinciden en {len(pub)} estudios")
    for p in problemas:
        print("  " + p)


main(sys.argv[1])
