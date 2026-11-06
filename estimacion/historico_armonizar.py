"""Armonización de las encuestas del CIS anteriores a cinco generales (20D-2015, 26J-2016, 28A-2019, 10N-2019 y 23J-2023),
para medir el error de cada combinación de supuestos de «Construye tu estimación» (estimacion/historico_rejilla.R).

Solo las variables que usa la rejilla. Los partidos se asignan por la etiqueta (los códigos cambian de un estudio a otro)
y se agrupan como concurrieron en la elección de destino. Los microdatos se descargan de cis.es (formulario con correo y
aceptación de las condiciones) y se extraen en estimacion/extract/<estudio>/.
Uso (desde la raíz):  python3 estimacion/historico_armonizar.py   ->  estimacion/historico.parquet"""
import glob, os, re, unicodedata
import numpy as np, pandas as pd, pyreadstat

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(RAIZ, "estimacion", "extract")

# estudio: mes de campo, elección de destino, elección del recuerdo y variables (part: participación en la elección
# recordada). El 3117 (preelectoral de 2015, panel 1.ª fase) no se puede descargar: su ficha en cis.es da error.
ESTUDIOS = {
    "3114": dict(mes="2015-10", eleccion="2015-12", ref="2011-11", peso=None, sexo="P31", edad="P32", ideo="P25", int="P23", vs="VOTOSIM", cer=None, rec="RECUERDO", part="P29", prob=None),
    "3134": dict(mes="2016-04", eleccion="2016-06", ref="2015-12", peso=None, sexo="P23", edad="P24", ideo="P17", int="P15", vs="VOTOSIMG", cer=None, rec="RECUERDO", part="P21", prob=None),
    "3141": dict(mes="2016-05", eleccion="2016-06", ref="2015-12", peso="PESO", sexo="P21", edad="P22", ideo="P15", int="P7", vs="VOTOSIMG", cer=None, rec="RECUERDO", part="P14", prob=("P12", "escala")),
    "3238": dict(mes="2019-01", eleccion="2019-04", ref="2016-06", peso=None, sexo="P43", edad="P44", ideo="P32", int="P28", vs="VOTOSIMG", cer="P36", rec="RECUERDO", part="P35", prob=("P24", "categorica")),
    "3240": dict(mes="2019-02", eleccion="2019-04", ref="2016-06", peso=None, sexo="P41", edad="P42", ideo="P36", int="P32", vs="VOTOSIMG", cer="P40", rec="RECUERDO", part="P39", prob=None),
    "3242": dict(mes="2019-03", eleccion="2019-04", ref="2016-06", peso="PESO", sexo="P22", edad="P23", ideo="P19", int="P10", vs="VOTOSIMG", cer="P14", rec="RECUERDO", part="P18", prob=("P12", "escala")),
    "3257": dict(mes="2019-07", eleccion="2019-11", ref="2019-04", peso=None, sexo="P40", edad="P41", ideo="P34", int="P32", vs="VOTOSIMG", cer="P39", rec="RECUERDO", part="P37", prob=("P14", "escala")),
    "3261": dict(mes="2019-09", eleccion="2019-11", ref="2019-04", peso=None, sexo="P33", edad="P34", ideo="P27", int="P25", vs="VOTOSIMG", cer="P32", rec="RECUERDO", part="P31", prob=("P15", "escala")),
    "3263": dict(mes="2019-10", eleccion="2019-11", ref="2019-04", peso="PESO", sexo="P23", edad="P24", ideo="P18", int="P9", vs="VOTOSIMG", cer="P13", rec="RECUERDO", part="P17", prob=("P11", "escala")),
    "3411": dict(mes="2023-06", eleccion="2023-07", ref="2019-11", peso="PESO", sexo="SEXO", edad="EDAD", ideo="ESCIDEOL", int="INTENCIONG", vs="VOTOSIMG", cer="CERCANIA", rec="RECUERDO", part="PARTICIPACIONG", prob=("PROBVOTO", "escala")),
    "3415": dict(mes="2023-07", eleccion="2023-07", ref="2019-11", peso="PESO", sexo="SEXO", edad="EDAD", ideo="ESCIDEOL", int="INTENCIONG", vs="VOTOSIMG", cer="CERCANIA", rec="RECUERDO", part="PARTICIPACIONG", prob=("PROBVOTO", "escala")),
}
LIDERES = {"rajoy": "mariano_rajoy", "sanchez": "pedro_sanchez", "iglesias": "pablo_iglesias", "rivera": "albert_rivera",
           "garzon": "alberto_garzon", "casado": "pablo_casado", "abascal": "santiago_abascal", "errejon": "inigo_errejon",
           "feijoo": "alberto_nunez_feijoo", "yolanda diaz": "yolanda_diaz", "belarra": "ione_belarra"}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"\(no leer\)", "", s)).strip()


def leer_sav(e):
    f = [x for x in glob.glob(os.path.join(EX, e, "**", "*"), recursive=True) if x.lower().endswith(".sav")][0]
    df, m = pyreadstat.read_sav(f)
    return df, m.variable_value_labels, dict(zip(m.column_names, m.column_labels))


# ---------------------------------------------------------------- partidos por etiqueta
def partido(et):
    t = norm(et)
    reglas = [
        (r"^(voto )?nulo|^voto nulo", "NULO"), (r"^(voto )?(en )?blanco$", "BLANCO"),
        (r"^no votaria|^no votara|^no iria", "NO_VOTARIA"), (r"^ninguno", "NINGUNO"),
        (r"^no sabe|^n\.s\.|^aun no lo tiene|no lo tiene decidido", "NS"), (r"^n\.c\.|^no contesta", "NC"),
        (r"^no tenia edad", "NO_TENIA_EDAD"), (r"^no tenia derecho", "SIN_DERECHO_VOTO"), (r"^no voto", "NO_VOTO"),
        (r"^no recuerda", "NR"), (r"^n\.p\.", "NP"),
        (r"^pp($|\s|\(|-)|^partido popular", "PP"), (r"^psoe|^psc", "PSOE"),
        (r"^sumar|movimiento sumar", "SUMAR"),
        (r"podem|unidos podemos|unidas podemos|en comu|en comun|en marea|com-pod|^up$", "PODEMOS_FAM"),
        (r"^iu\b|^iu-|izquierda unida|unidad popular", "IU"),
        (r"^ciudadanos|^c's|^cs$", "CS"), (r"^vox", "VOX"),
        (r"mas pais|mes compromis", "MAS_PAIS"), (r"compromis", "COMPROMIS"),
        (r"^erc|esquerra republicana", "ERC"),
        (r"convergencia|^ciu$|^dil|pdecat|jxcat|^junts|^cdc|juntsxcat|democracia i llibertat", "JUNTS"),
        (r"pnv", "PNV"), (r"bildu|amaiur", "EH_BILDU"), (r"^upyd", "UPYD"), (r"^bng|bloque nacionalista galego", "BNG"),
        (r"^cc($|\b|-)|^cca|coalicion canaria", "CC"), (r"^pacma", "PACMA"), (r"^upn|^na\+|navarra suma", "UPN"),
        (r"^cup", "CUP"), (r"^otro", "OTRO"),
    ]
    for p, idp in reglas:
        if re.search(p, t):
            return idp
    return "OTRO"


def agrupar_hist(x, eleccion):
    """Candidaturas como concurrieron en la elección de destino."""
    x = x.copy()
    if eleccion == "2015-12":
        x[x.isin(["PODEMOS_FAM", "COMPROMIS"])] = "PODEMOS"
    elif eleccion in ("2016-06",):
        x[x.isin(["PODEMOS_FAM", "IU", "COMPROMIS"])] = "UP"
    elif eleccion == "2019-04":
        x[x.isin(["PODEMOS_FAM", "IU"])] = "UP"
    elif eleccion == "2019-11":
        x[x.isin(["PODEMOS_FAM", "IU"])] = "UP"
        x[x.isin(["COMPROMIS"])] = "MAS_PAIS"
    elif eleccion == "2023-07":
        x[x.isin(["PODEMOS_FAM", "IU", "MAS_PAIS", "COMPROMIS"])] = "SUMAR"
    return x


def con_etiquetas(df, vals, var):
    if var is None or var not in df:
        return pd.Series([np.nan] * len(df), dtype=object)
    lab = vals.get(var, {})
    return df[var].map(lambda c: partido(lab[c]) if c in lab else (np.nan if pd.isna(c) else "OTRO"))


def escala(df, vals, var, lo, hi):
    if var is None or var not in df:
        return pd.Series(np.nan, index=df.index)
    v = pd.to_numeric(df[var], errors="coerce")
    return v.where(v.between(lo, hi))


PARTICIPACION = {"fue a votar y voto": "Fue a votar y votó", "voto": "Votó", "voto por correo": "Votó por correo",
                 "prefirio no votar": "Prefirió no votar/Me abstuve", "no voto": "No votó",
                 "no fue a votar porque no pudo": "No fue a votar porque no pudo",
                 "fue a votar pero no pudo hacerlo": "Fue a votar pero no pudo hacerlo",
                 "no tenia edad para votar": "No tenía edad para votar", "no tenia derecho a voto": "No tenía derecho a voto",
                 "no recuerda": "NR", "n.s.": "NS", "n.c.": "NC", "n.p.": "NP"}


def edad_g(e):
    return pd.cut(e, [17, 24, 34, 44, 54, 64, 200], labels=["18-24", "25-34", "35-44", "45-54", "55-64", "65 y más"]).astype(object)


filas = []
for e, s in ESTUDIOS.items():
    df, vals, etq = leer_sav(e)
    out = pd.DataFrame({"estudio": e, "mes": s["mes"], "eleccion": s["eleccion"], "ref": s["ref"]}, index=df.index)
    out["peso"] = pd.to_numeric(df[s["peso"]], errors="coerce") if s["peso"] else 1.0
    sx = df[s["sexo"]].map(lambda c: norm(vals.get(s["sexo"], {}).get(c, "")))
    out["sexo"] = np.where(sx.str.startswith("hombre"), "Hombre", np.where(sx.str.startswith("mujer"), "Mujer", None))
    out["edad_g"] = edad_g(pd.to_numeric(df[s["edad"]], errors="coerce").where(lambda v: v.between(18, 120)))
    out["estudios"] = df["ESTUDIOS"].map(lambda c: vals.get("ESTUDIOS", {}).get(c, "NC")) if "ESTUDIOS" in df else "NC"
    out["ideologia"] = escala(df, vals, s["ideo"], 1, 10)
    for k, var in [("intencion_voto", s["int"]), ("voto_simpatia", s["vs"]), ("cercania", s["cer"]), ("recuerdo_original", s["rec"])]:
        out[k] = con_etiquetas(df, vals, var)
    for k in ["intencion_voto", "voto_simpatia", "cercania"]:
        out[k] = agrupar_hist(out[k], s["eleccion"])
    out["recuerdo_voto"] = agrupar_hist(out["recuerdo_original"], s["eleccion"])   # en la agrupación de la elección de destino
    out["recuerdo_celda"] = agrupar_hist(out["recuerdo_original"], s["ref"])       # en la de la elección recordada
    # participación en la elección recordada, con las categorías de la serie principal (R/recuerdo.R)
    lab = vals.get(s["part"], {})
    out["participacion_g"] = df[s["part"]].map(lambda c: PARTICIPACION.get(norm(lab.get(c, "")), "NC" if pd.isna(c) else None))
    sin = out["participacion_g"].isna()
    if sin.any():
        raise SystemExit(f"{e}: categorías de participación sin clasificar: {sorted(set(df.loc[sin, s['part']].map(lambda c: lab.get(c, c))))}")
    if s["prob"]:
        var, tipo = s["prob"]
        if tipo == "escala":
            out["prob_votar"] = escala(df, vals, var, 0, 10)
        else:   # «Sí, con toda seguridad» = 10, «probablemente sí» = 7, «probablemente no» = 3, «no, con toda seguridad» = 0
            lab = vals.get(var, {})
            m = {"si, con toda seguridad": 10, "probablemente si": 7, "probablemente no": 3, "no, con toda seguridad": 0}
            out["prob_votar"] = df[var].map(lambda c: m.get(norm(lab.get(c, "")), np.nan))
    else:
        out["prob_votar"] = np.nan
    # valoración de líderes: variables con el nombre del líder y escala «muy mal ... muy bien»
    for var, et in etq.items():
        t = norm(et or "")
        if t.startswith("grado de confianza") or var not in df:
            continue
        clave = next((v for k, v in LIDERES.items() if k in t), None)
        lab = " ".join(norm(x) for x in vals.get(var, {}).values())
        if clave and "muy bien" in lab:
            out[f"lider_{clave}"] = escala(df, vals, var, 0, 10)
    filas.append(out)
    print(e, s["eleccion"], len(out), "ent.;", "líderes:", [c for c in out if c.startswith("lider_")])

h = pd.concat(filas, ignore_index=True)
for c in ["ideologia", "prob_votar", "peso"] + [c for c in h if c.startswith("lider_")]:
    h[c] = pd.to_numeric(h[c], errors="coerce")
h.to_parquet(os.path.join(RAIZ, "estimacion", "historico.parquet"), index=False)
print("estimacion/historico.parquet", h.shape)
