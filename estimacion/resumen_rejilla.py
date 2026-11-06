"""Resumen de la rejilla de «Construye tu estimación»: cuánto mueve cada supuesto y contraste con el 23J.

Cifras para la nota metodológica. Uso (desde la raíz, después de estimacion/rejilla.R):
    python3 estimacion/resumen_rejilla.py
Escribe estimacion/rejilla_resumen.csv (cuánto mueve cada supuesto) y lo imprime todo.
"""
import pandas as pd

r = pd.read_csv("estimacion/rejilla.csv.gz", dtype={"estudio": str})
r["alfa"] = r["alfa"].map(lambda a: format(float(a), "g"))
CLAVE = ["base", "votante", "reparto", "alfa"]
M3 = {"base": "intencion", "votante": "p9", "reparto": "scr", "alfa": "1"}

ancho = r[r.partido.isin(["PSOE", "PP"])].pivot_table(index=["estudio", "mes"] + CLAVE, columns="partido", values="est",
                                                       fill_value=0).reset_index()
ancho["ventaja"] = ancho.PSOE - ancho.PP
con_prob = ancho[ancho.mes >= "2022-09"]


def rango(df):
    return df.groupby("mes").ventaja.agg(lambda v: v.max() - v.min())


filas = []
for d in CLAVE:
    fijo = con_prob
    for o in CLAVE:
        if o != d:
            fijo = fijo[fijo[o] == M3[o]]
    g = rango(fijo)
    filas.append({"supuesto": d, "rango_medio": round(g.mean(), 1), "rango_max": round(g.max(), 1), "meses": len(g)})
g = rango(con_prob)
filas.append({"supuesto": "todos a la vez", "rango_medio": round(g.mean(), 1), "rango_max": round(g.max(), 1), "meses": len(g)})
res = pd.DataFrame(filas)
res.to_csv("estimacion/rejilla_resumen.csv", index=False)
print("Rango de la ventaja PSOE−PP al mover cada supuesto con los demás en M3 (desde sep-2022):")
print(res.to_string(index=False))

ult = r.mes.max()
u = r[r.mes == ult]
print(f"\nÚltimo barómetro ({ult}): rango de cada partido en las {u[CLAVE].drop_duplicates().shape[0]} combinaciones")
print(u.groupby("partido").est.agg(["min", "max"]).sort_values("max", ascending=False).head(8).round(1).to_string())
ua = ancho[ancho.mes == ult]
print(f"Ventaja PSOE−PP: de {ua.ventaja.min():.1f} a {ua.ventaja.max():.1f}; PSOE delante en {(ua.ventaja > 0).mean():.0%} de las combinaciones")
for m, c in {"M1": ("simpatia", "todos", "ninguno", "0"), "M2": ("simpatia", "todos", "ninguno", "1"),
             "M3": ("intencion", "p9", "scr", "1"), "M4": ("intencion", "p9", "regresion", "1")}.items():
    x = ua[(ua.base == c[0]) & (ua.votante == c[1]) & (ua.reparto == c[2]) & (ua.alfa == c[3])]
    print(f"  {m}: PSOE {x.PSOE.iloc[0]:.1f}, PP {x.PP.iloc[0]:.1f}, ventaja {x.ventaja.iloc[0]:+.1f}")

# por valor de cada supuesto: ventaja media en el último barómetro
print("\nVentaja PSOE−PP media en el último barómetro, por opción de cada supuesto:")
for d in CLAVE:
    print(" ", d, ua.groupby(d).ventaja.mean().round(1).to_dict())

# contraste con el 23J
ESPACIO = {"SUMAR", "PODEMOS", "UNIDAS_PODEMOS", "IU", "MAS_PAIS", "COMPROMIS", "MES_COMPROMIS", "EN_COMU_PODEM"}
REAL = {"PP": 33.06, "PSOE": 31.68, "VOX": 12.38, "SUMAR": 12.33}
c = r[r.estudio.isin(["3410", "3413"])].copy()
c["partido"] = c.partido.where(~c.partido.isin(ESPACIO), "SUMAR")
c = c.groupby(["estudio"] + CLAVE + ["partido"]).est.sum().reset_index()
c = c[c.partido.isin(REAL)]
c["error"] = c.est - c.partido.map(REAL)
e = c.groupby(["estudio"] + CLAVE).apply(lambda g: pd.Series({
    "medio": g.error.abs().mean(),
    "ventaja": (g.est[g.partido == "PP"].iloc[0] - g.est[g.partido == "PSOE"].iloc[0]) - (REAL["PP"] - REAL["PSOE"])}),
    include_groups=False).reset_index()
print("\nContraste con el 23J (error medio en PP, PSOE, VOX y Sumar):")
for s, g in e.groupby("estudio"):
    print(f"  {s}: de {g.medio.min():.1f} a {g.medio.max():.1f} (mediana {g.medio.median():.1f}); ventaja PP−PSOE desviada de {g.ventaja.min():+.1f} a {g.ventaja.max():+.1f}")
    print("   mejores:", g.nsmallest(3, "medio")[CLAVE + ["medio", "ventaja"]].round(2).values.tolist())
    for d in CLAVE:
        print("   ", d, g.groupby(d).medio.mean().round(2).to_dict())

# margen aproximado (n efectivo) frente al remuestreo de estimacion/modelos.R, en los cuatro atajos
m = pd.read_csv("estimacion/resultados_modelos.csv", dtype={"estudio": str})
print("\nMargen por remuestreo / margen aproximado (partidos con al menos un 5 %):")
for mod, cf in {"M1": ("simpatia", "todos", "ninguno", "0"), "M2": ("simpatia", "todos", "ninguno", "1"),
                "M3": ("intencion", "p9", "scr", "1"), "M4": ("intencion", "p9", "regresion", "1")}.items():
    x = r[(r.base == cf[0]) & (r.votante == cf[1]) & (r.reparto == cf[2]) & (r.alfa == cf[3])]
    j = x.merge(m[m.modelo == mod], on=["estudio", "partido"], suffixes=("", "_m"))
    j = j[j.est_m >= 5]
    q = ((j.hi - j.lo) / 2 / j.me).quantile([.1, .5, .9]).round(2).tolist()
    print(f"  {mod}: deciles 1, 5 y 9: {q}; diferencia máxima de la estimación {(j.est - j.est_m).abs().max():.3f}")
