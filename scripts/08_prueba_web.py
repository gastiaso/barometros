"""Comprueba que la web calcula lo mismo que R y que el CIS.

Abre la web en Chromium (Playwright), recalcula con el código del navegador (calcular() de web/js/app.js, sobre las
columnas de web/datos) cada cifra de inventario/referencias_cis.csv y la compara con:
  - el valor calculado en R (inventario/validacion_cifras_cis.csv), con una tolerancia de 0,001 (la web guarda los
    pesos en coma flotante de 32 bits);
  - la cifra publicada por el CIS, con la tolerancia de la referencia.
Comprueba además que los bloques suman lo que suman sus respuestas, unos casos de regresión (REGRESION) y que el
descompresor alternativo (para navegadores sin DecompressionStream) da los mismos datos.

Uso: python scripts/08_prueba_web.py <raíz del proyecto>   (después de scripts/07_web.R)
Sale con código 1 si algo no cuadra.
"""
import asyncio, csv, functools, http.server, os, socketserver, sys, threading

from playwright.async_api import async_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
WEB = os.path.join(ROOT, "web")
INV = os.path.join(ROOT, "inventario")
TOL_R = 0.001


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def servir():
    handler = functools.partial(Silencioso, directory=WEB)
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/index.html"


CALCULAR = """async (refs) => {
  const out = [];
  for (const r of refs) {
    const [tipo, col, cat] = r.indicador.split(':');
    const est = EST.find(e => e.estudio === r.estudio);
    if (!est || !META.columnas[col]) { out.push({ ...r, web: null, motivo: 'sin columna o estudio' }); continue; }
    let spec, id;
    if (tipo === 'media' && col.startsWith('lider_')) { spec = { preg: 'lideres' }; id = col; }
    else if (tipo === 'media' && col.startsWith('ministro_')) { spec = { preg: 'ministros' }; id = col; }
    else if (tipo === 'media') { spec = { preg: col }; id = col; }
    else { spec = { preg: col }; id = cat; }
    const res = await calcular({ ...spec, desde: est.mes, hasta: est.mes });
    out.push({ ...r, web: res.filas[0].grupos[0].vals[id] ?? 0 });
  }
  return out;
}"""

BLOQUES = """async () => {
  const errores = [];
  const r = await calcular({ preg: 'intencion_voto', bloques: [{ nombre: 'B', ids: ['PSOE', 'SUMAR', 'PODEMOS'] }] });
  for (const f of r.filas) {
    const g = f.grupos[0];
    const s = ['PSOE', 'SUMAR', 'PODEMOS'].reduce((a, k) => a + (g.vals[k] || 0), 0);
    if (Math.abs(s - (g.vals['BLQ:B'] || 0)) > 1e-9) errores.push('bloque de respuesta única ' + f.e.mes);
  }
  const m = await calcular({ preg: 'prob_esp', bloques: [{ nombre: 'B', ids: ['PROB_001', 'PROB_002'] }] });
  for (const f of m.filas) {
    const g = f.grupos[0], a = g.vals.PROB_001 || 0, b = g.vals.PROB_002 || 0, x = g.vals['BLQ:B'] || 0;
    if (x > a + b + 1e-9 || x < Math.max(a, b) - 1e-9) errores.push('bloque de menciones múltiples ' + f.e.mes);
  }
  return errores;
}"""

# Casos que fallaban antes: ceros en meses en que la respuesta no existía, medias móviles que cruzaban meses sin la
# pregunta, la lista de líderes alterada por un cruce y el error típico que no devolvía puntoDe
REGRESION = """async () => {
  const errores = [];
  const cfgS = { preg: 'intencion_voto_r', movil: true, cats: ['SUMAR'] };
  const s = series(await calcular(cfgS), cfgS)[0].pts;
  if (s.some(p => p.mes < '2023-04' && p.v != null)) errores.push('media móvil de Sumar (agrupación del CIS) con dato antes de abr-2023');
  if (!s.some(p => p.mes === '2023-04' && p.v != null)) errores.push('media móvil de Sumar sin dato en abr-2023');
  const rm = await calcular({ preg: 'ministros' });
  const cfgM = { preg: 'ministros', movil: true, cats: [MINISTROS[0]] };
  const m = series(rm, cfgM)[0].pts, conPregunta = f => f.grupos.some(gr => Object.keys(gr.ns || {}).length);
  if (m.some(p => !conPregunta(p.f) && p.v != null)) errores.push('media móvil de ministros con dato en un mes sin la pregunta');
  if (!rm.filas.some(f => f.e.mes === '2021-01' && conPregunta(f))) errores.push('ministros sin datos en ene-2021 (3307)');
  const nl = LIDERES.length;
  rupturas({ preg: 'lideres', cruce: 'sexo', recuerdo: true });
  if (LIDERES.length !== nl) errores.push('un panel de líderes con cruce altera la lista de líderes');
  const r = await calcular({ preg: 'intencion_voto_r' });
  const pt = puntoDe(r, r.filas[r.filas.length - 1], 0, 'PSOE');
  if (!(pt.se > 0)) errores.push('puntoDe no devuelve el error típico');
  return errores;
}"""


async def main():
    refs = [dict(r) for r in csv.DictReader(open(os.path.join(INV, "referencias_cis.csv"), encoding="utf-8"))]
    en_r = {(r["estudio"], r["indicador"]): float(r["calculado"])
            for r in csv.DictReader(open(os.path.join(INV, "validacion_cifras_cis.csv"), encoding="utf-8"))
            if r["calculado"] not in ("", "NA")}
    srv, url = servir()
    fallos = []
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await nav.new_page()
        errores_js = []
        pg.on("pageerror", lambda e: errores_js.append(str(e)))
        await pg.goto(url)
        await pg.wait_for_function("typeof META !== 'undefined' && META && EST.length > 0", timeout=60000)
        res = await pg.evaluate(CALCULAR, refs)
        for r in res:
            clave = (r["estudio"], r["indicador"])
            if r["web"] is None:
                print(f"  omitida {clave}: {r['motivo']}")   # p. ej., series retiradas en modo veda
                continue
            web, cis, tol = float(r["web"]), float(r["valor"]), float(r["tolerancia"])
            if clave in en_r and abs(web - en_r[clave]) > TOL_R:
                fallos.append(f"web ≠ R en {clave}: web {web:.4f}, R {en_r[clave]:.4f}")
            if abs(web - cis) > tol:
                fallos.append(f"web ≠ CIS en {clave}: web {web:.4f}, CIS {cis}")
        fallos += await pg.evaluate(BLOQUES)
        fallos += await pg.evaluate(REGRESION)
        # descompresor alternativo: mismas columnas sin DecompressionStream
        ctx = await nav.new_context()
        await ctx.add_init_script("delete window.DecompressionStream;")
        pf = await ctx.new_page()
        await pf.goto(url)
        await pf.wait_for_function("typeof META !== 'undefined' && META && EST.length > 0", timeout=60000)
        r0 = [x for x in refs if (x["estudio"], x["indicador"]) in en_r][:10]
        alt = await pf.evaluate(CALCULAR, r0)
        for a, b in zip(alt, [x for x in res if (x["estudio"], x["indicador"]) in {(y["estudio"], y["indicador"]) for y in r0}]):
            if a["web"] is not None and abs(float(a["web"]) - float(b["web"])) > 1e-9:
                fallos.append(f"el descompresor alternativo no coincide en {a['indicador']}")
        if not await pf.evaluate("!!window.fflate"):
            fallos.append("sin DecompressionStream no se ha cargado el descompresor alternativo")
        fallos += [f"error de JavaScript: {e}" for e in errores_js]
        await nav.close()
    srv.shutdown()
    print(f"Referencias comprobadas en la web: {sum(r['web'] is not None for r in res)} de {len(refs)}")
    if fallos:
        print("FALLOS:\n  " + "\n  ".join(fallos))
        sys.exit(1)
    print("La web calcula igual que R y que el CIS.")


asyncio.run(main())
