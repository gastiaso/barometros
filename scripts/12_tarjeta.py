"""Tarjeta del último barómetro: imagen de 1200 × 675 con los cambios significativos del mes y un texto de hasta
280 caracteres para acompañarla en redes.

Reutiliza el cálculo de «Qué cambia en el último barómetro» de la web (cambiosUltimo + Benjamini–Hochberg, en
web/js/app.js), así que la tarjeta lista exactamente los mismos cambios que la web. Cifras con una décima, sin
adjetivos, con la fuente. En modo veda las series electorales no están y la tarjeta solo lleva el resto.

Salida: web/img/tarjeta.png y web/img/tarjeta.txt (se rehacen en cada publicación).
Uso: python scripts/12_tarjeta.py <raíz del proyecto>   (después de scripts/07_web.R)
"""
import asyncio, functools, http.server, json, os, socketserver, sys, threading

from playwright.async_api import async_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
WEB = os.path.join(ROOT, "web")
IMG = os.path.join(WEB, "img", "tarjeta.png")
TXT = os.path.join(WEB, "img", "tarjeta.txt")
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre"]
MAX_ITEMS = 6


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def mes_largo(m):
    a, n = m.split("-")
    return f"{MESES[int(n) - 1]} de {a}"


# calcula en la página los cambios del resumen y devuelve una lista plana ordenada por magnitud
CAMBIOS = """async () => {
  const rs = (await Promise.all(RESUMEN.map(cambiosUltimo))).filter(Boolean);
  aplicarFDR(rs);
  const ult = EST[EST.length - 1], ant = EST[EST.length - 2];
  const items = rs.filter(r => r.cambios && r.cambios.length).flatMap(r => r.cambios.map(c => ({
    pregunta: r.t, respuesta: nombreResp(preg(r.preg), c.id), media: !!r.media, valor: c.vB, dif: c.d,
    mesA: r.fA.e.mes })));
  items.sort((a, z) => Math.abs(z.dif) / (z.media ? 0.1 : 1) - Math.abs(a.dif) / (a.media ? 0.1 : 1));
  return { ult: ult.mes, estudio: ult.estudio, ant: ant.mes, n: ult.info?.n, items,
           sin: rs.filter(r => r.cambios && !r.cambios.length).map(r => r.t) };
}"""


CORTO = {"Principales problemas de España": "problema de España", "Problemas que más le afectan": "problema personal",
         "Intención directa de voto": "intención directa", "Voto + simpatía": "voto + simpatía",
         "Preferencia como presidente": "preferido como presidente", "Valoración de líderes": "valoración",
         "Situación económica general": "economía de España", "Situación económica personal": "economía personal",
         "Autoubicación ideológica": "ideología"}


def fmt(v, media):
    s = f"{v:.2f}" if media else f"{v:.1f}"
    return s.replace(".", ",")


def signo(d, media):
    return ("+" if d > 0 else "−") + fmt(abs(d), media)


def tarjeta_html(r):
    ult, ant = mes_largo(r["ult"]), mes_largo(r["ant"])
    filas = "".join(
        f'<li><span class="q">{i["pregunta"]}</span><span class="r">{i["respuesta"]}</span>'
        f'<span class="v">{fmt(i["valor"], i["media"])}{"" if i["media"] else " %"}</span>'
        f'<span class="d {"sube" if i["dif"] > 0 else "baja"}">{signo(i["dif"], i["media"])}</span></li>'
        for i in r["items"][:MAX_ITEMS])
    vacio = "" if r["items"] else f"<p class='nada'>Sin cambios significativos frente a {ant}.</p>"
    return f"""<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="../css/estilos.css">
<style>
  html,body{{margin:0;background:var(--bg)}}
  .t{{width:1200px;height:675px;box-sizing:border-box;padding:48px 56px;display:flex;flex-direction:column;gap:18px;font-family:var(--font-b);color:var(--ink)}}
  .k{{font-family:var(--font-d);font-size:20px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin:0}}
  h1{{font-family:var(--font-d);font-size:44px;line-height:1.1;margin:0;text-transform:uppercase;letter-spacing:.02em}}
  h1 small{{display:block;font-size:22px;letter-spacing:.04em;color:var(--ink2);margin-top:6px;font-weight:400}}
  ul{{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px;flex:1}}
  li{{display:grid;grid-template-columns:270px 1fr 120px 104px;gap:16px;align-items:baseline;font-size:25px;line-height:1.25;border-top:1px solid var(--line);padding-top:8px}}
  .q{{font-family:var(--font-d);font-size:17px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3)}}
  .r{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
  .v{{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink2)}}
  .d{{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}}
  .d.sube{{color:#1f7a3a}} .d.baja{{color:#b3261e}}
  .nada{{font-size:28px;margin:30px 0}}
  .f{{font-size:17px;color:var(--ink3);margin:0;display:flex;justify-content:space-between;gap:20px}}
</style></head><body><div class="t">
<p class="k">Barómetro a barómetro · qué cambia en el último barómetro del CIS</p>
<h1>{ult}<small>frente a {ant} (estudio {r["estudio"]}{", " + format(int(r["n"]), ",").replace(",", ".") + " entrevistas" if r.get("n") else ""})</small></h1>
<ul>{filas}</ul>{vacio}
<p class="f"><span>Cambios de al menos un punto, significativos tras corregir por comparaciones múltiples (FDR 5 %). Fuente: CIS, barómetros mensuales (microdatos). Elaboración: Barómetro a barómetro.</span><span>gastiaso.github.io/barometros</span></p>
</div></body></html>"""


def texto_280(r):
    ult, ant = mes_largo(r["ult"]), mes_largo(r["ant"])
    cab = f"CIS, barómetro de {ult} ({r['estudio']}). Frente a {ant}:"
    partes = [f"{i['respuesta']} ({CORTO.get(i['pregunta'], i['pregunta'].lower())}) {signo(i['dif'], i['media'])}, "
              f"{fmt(i['valor'], i['media'])}{'' if i['media'] else ' %'}" for i in r["items"]]
    cola = " https://gastiaso.github.io/barometros/#series"
    if not partes:
        return f"{cab} sin cambios significativos.{cola}"
    txt = ""
    for k in range(len(partes), 0, -1):
        cuerpo = "; ".join(partes[:k]) + ("." if k == len(partes) else " y otros.")
        txt = f"{cab} {cuerpo}{cola}"
        if len(txt) <= 280:
            return txt
    return (f"{cab} {partes[0]}." + cola)[:280]


async def main():
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Silencioso, directory=WEB))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await nav.new_page(viewport={"width": 1200, "height": 675}, device_scale_factor=2)
        await pg.add_init_script("localStorage.setItem('bet-tema','light');")
        await pg.goto(base + "index.html#series")
        await pg.wait_for_function("typeof META !== 'undefined' && META && EST.length > 0", timeout=120000)
        r = await pg.evaluate(CAMBIOS)
        html = tarjeta_html(r)
        ruta_html = os.path.join(WEB, "img", "tarjeta.html")
        open(ruta_html, "w", encoding="utf-8").write(html)
        await pg.goto(base + "img/tarjeta.html")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=IMG, clip={"x": 0, "y": 0, "width": 1200, "height": 675})
        os.remove(ruta_html)
        await nav.close()
    srv.shutdown()
    txt = texto_280(r)
    open(TXT, "w", encoding="utf-8").write(txt + "\n")
    print(f"Tarjeta: {IMG} ({len(r['items'])} cambios) y {TXT} ({len(txt)} caracteres)")
    print(txt)


asyncio.run(main())
