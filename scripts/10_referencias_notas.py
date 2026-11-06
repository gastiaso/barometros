"""Referencias de validación a partir de las notas de estimación del CIS.

Cada nota de estimación (un PDF por barómetro, los mismos ficheros que lee estimacion/cotejo_estimacion_cis.py) trae
la tabla «Voto directo en la encuesta (en % sobre censo)»: la intención directa de voto recodificada (INTENCIONGR) de
cada candidatura, más blanco, nulo, «no votaría», «no sabe» y «no contesta». Este script la extrae de los 64 PDF y
la añade a inventario/referencias_cis.csv como indicadores `pct:intencion_voto_r:<partido>`, con lo que la
validación de R (R/validar.R) comprueba la intención directa en todos los barómetros y no solo en los que tienen
avance de resultados transcrito a mano.

Uso (desde la raíz):  python scripts/10_referencias_notas.py <carpeta con estimacion_<estudio>.pdf>

- La correspondencia etiqueta → identificador de partido se toma de estimacion/estimacion_cis.csv, que ya tiene,
  para cada estudio y en el mismo orden que el PDF, la etiqueta del CIS y el identificador armonizado; las filas
  que no son candidatura (en blanco, nulo, abstención, no sabe, no contesta) se reconocen por su texto.
- Si un indicador ya está en referencias_cis.csv (de un avance de resultados), se conserva el existente y se
  comprueba que la nota da la misma cifra; si difieren, el script se detiene.
- Las filas que ya venían de las notas (fuente «Nota de estimación …») se sustituyen en cada ejecución.
- Si una tabla no se puede leer o no cuadra con la transcripción, el script falla: nunca escribe cifras dudosas.
"""
import csv, os, re, subprocess, sys

NUM = re.compile(r"(?<![\w±])(\d{1,2}(?:,\d{1,2})?)(?![\w,])")
FIN = re.compile(r"^[\s\uf0b7•*\-–]*(\(N\)|Como consecuencia|Intervalo de confianza|En el caso particular|Este intervalo)")
# filas que no son candidatura (la transcripción de estimacion_cis.csv sí incluye «En blanco», con su estimación)
NO_CANDIDATURA = [
    (re.compile(r"^voto nulo", re.I), "NULO"),
    (re.compile(r"^abstenci", re.I), "NO_VOTARIA"),
    (re.compile(r"^no sabe", re.I), "NS"),
    (re.compile(r"^no contesta", re.I), "NC"),
]
FUENTE = "Nota de estimación {estudio} (voto directo, % sobre censo)"
# etiquetas de la nota que agrupan dos categorías de INTENCIONGR: el indicador suma las dos (R/validar.R admite «A+B»)
AGRUPADAS = [
    (re.compile(r"^m[aá]s pa[ií]s\s*/\s*comprom[ií]s", re.I), "MAS_PAIS+MES_COMPROMIS"),
    (re.compile(r"^movimiento sumar", re.I), "SUMAR+UNIDAS_PODEMOS+PODEMOS"),   # jun-jul 2023: la nota suma Sumar y Podemos
]
# el mismo partido lleva identificadores distintos según el periodo en INTENCIONGR: se suman (solo uno está presente)
ALIAS = {"UPN": "UPN+NA_SUMA", "CC": "CC+CCA_NC", "COMPROMIS": "COMPROMIS+MES_COMPROMIS"}
TOL_SUMA = "0.1"     # una suma de cifras redondeadas a una décima puede desviarse hasta una décima
MINIMO = 0.15        # por debajo, el CIS ajusta la cifra a 0,1 (lo dice en la nota): no sirve de referencia
EXCEPCIONES = "inventario/referencias_excepciones.csv"   # estudio, indicador, tolerancia, motivo
TOL = "0.051"   # una décima de redondeo


def filas_directo(pdf):
    """[(etiqueta, voto directo)] de la tabla de la nota, en el orden del PDF."""
    t = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    lineas = t.splitlines()
    ini = next(i for i, l in enumerate(lineas) if "censo)" in l and any("Voto directo" in x for x in lineas[max(0, i - 12):i]))
    filas, pendiente, sueltos = [], "", []
    for l in lineas[ini + 1:]:
        if FIN.match(l) or (filas and re.match(r"^no contesta", filas[-1][0], re.I)):
            break
        if not l.strip() or re.match(r"^\s*(censo\)|\(en % sobre|voto válido\)|error\*)", l):
            continue
        sin_margen = re.sub(r"±\s*\d+(,\d+)?", " ", l)
        nums = NUM.findall(sin_margen)
        texto = re.sub(r"\*+", "", NUM.sub(" ", sin_margen)).strip()
        if nums and not texto:                     # cifras desplazadas a una línea sin etiqueta
            sueltos += nums
            continue
        if nums or sueltos:
            if not nums and not texto:
                continue
            if not nums:                            # etiqueta cuya cifra vino en la línea anterior
                todos = sueltos
            else:
                todos = sueltos + nums
            etiqueta = re.sub(r"\s+", " ", (pendiente + " " + texto).strip())
            if not etiqueta and filas:              # continuación de una etiqueta de varias líneas con cifra
                filas[-1] = (filas[-1][0], filas[-1][1])
            else:
                filas.append((etiqueta, float(todos[0].replace(",", "."))))
            pendiente, sueltos = "", []
        elif filas and pendiente == "" and (texto.startswith("(") or filas[-1][0].count("(") > filas[-1][0].count(")")):
            filas[-1] = (filas[-1][0] + " " + texto, filas[-1][1])   # resto de una etiqueta de varias líneas
        else:
            pendiente = (pendiente + " " + texto).strip()
    if len(filas) < 8:
        raise ValueError(f"solo {len(filas)} filas leídas")
    return filas


def norm(s):
    s = re.sub(r"[*\-–]+", " ", str(s)).lower()
    return re.sub(r"[^a-z0-9áéíóúñç+/]+", " ", s).strip()


def main(carpeta):
    pub = {}
    with open("estimacion/estimacion_cis.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pub.setdefault(r["estudio"], {})[norm(r["etiqueta_cis"])] = r["partido"]
    # etiqueta → partido en cualquier estudio (para las candidaturas que la nota lista sin estimación, con «-»)
    global_map = {}
    for m in pub.values():
        for k, v in m.items():
            if global_map.setdefault(k, v) != v:
                sys.exit(f"etiqueta «{k}» con dos identificadores en estimacion_cis.csv: {global_map[k]} y {v}")
    with open("inventario/referencias_cis.csv", encoding="utf-8") as f:
        refs = list(csv.DictReader(f))
    campos = list(refs[0])
    existentes = {(r["estudio"], r["indicador"]): r for r in refs if not r["fuente"].startswith("Nota de estimación")}
    excepciones = {}
    if os.path.exists(EXCEPCIONES):
        with open(EXCEPCIONES, encoding="utf-8") as f:
            excepciones = {(r["estudio"], r["indicador"]): r for r in csv.DictReader(f)}
    nuevas, problemas, cotejadas = [], [], 0
    for estudio, mapa in pub.items():
        pdf = os.path.join(carpeta, f"estimacion_{estudio}.pdf")
        try:
            leidas = filas_directo(pdf)
        except Exception as e:                      # noqa: BLE001
            problemas.append(f"{estudio}: no se pudo leer la tabla ({e})")
            continue
        for etiqueta, v in leidas:
            pid = next((g for rx, g in NO_CANDIDATURA if rx.match(etiqueta)), None)
            if pid is None:
                pid = next((g for rx, g in AGRUPADAS if rx.match(etiqueta)), None)
            if pid is None:
                pid = mapa.get(norm(etiqueta)) or global_map.get(norm(etiqueta))
            if pid is None:
                problemas.append(f"{estudio}: etiqueta sin identificador: «{etiqueta}»")
                continue
            if pid == "OTRO":   # «Otros partidos» de la nota agrupa también las candidaturas que no lista: no es una categoría
                continue
            if v < MINIMO:
                continue
            pid = ALIAS.get(pid, pid)
            ind = f"pct:intencion_voto_r:{pid}"
            tol, fuente = (TOL_SUMA if "+" in pid else TOL), FUENTE.format(estudio=estudio)
            if (estudio, ind) in excepciones:
                tol, fuente = excepciones[(estudio, ind)]["tolerancia"], f"{fuente}; {excepciones[(estudio, ind)]['motivo']}"
            previa = existentes.get((estudio, ind))
            if previa is None and pid in ALIAS.values():   # el avance usa el identificador del periodo
                previa = next((existentes.get((estudio, f"pct:intencion_voto_r:{c}")) for c in pid.split("+")
                               if (estudio, f"pct:intencion_voto_r:{c}") in existentes), None)
            if previa is not None:
                cotejadas += 1
                if abs(float(previa["valor"]) - v) > 1e-9:
                    problemas.append(f"{estudio} {pid}: la nota da {v} y {previa['fuente']} da {previa['valor']}")
                continue
            nuevas.append({"estudio": estudio, "indicador": ind, "valor": f"{v:g}", "tolerancia": tol, "fuente": fuente})
    if problemas:
        sys.exit("No se escribe nada:\n  " + "\n  ".join(problemas))
    salida = [r for r in refs if not r["fuente"].startswith("Nota de estimación")] + nuevas
    with open("inventario/referencias_cis.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos, lineterminator="\n")
        w.writeheader()
        w.writerows(salida)
    print(f"referencias_cis.csv: {len(nuevas)} cifras nuevas de las notas de estimación en {len(pub)} estudios; "
          f"{cotejadas} coinciden con las de los avances ya transcritos ({len(salida)} referencias en total)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
