"""Imagen de vista previa para redes (og:image): captura de la pestaña de series con los paneles por defecto.

Se rehace en cada publicación, así que sigue al último barómetro. En modo veda los paneles por defecto no incluyen
series electorales, y la imagen tampoco. Actualiza también el texto alternativo de la imagen en web/index.html.

Uso: python scripts/09_vista_previa.py <raíz del proyecto>   (después de scripts/07_web.R)
"""
import asyncio, functools, http.server, json, os, re, socketserver, sys, threading

from playwright.async_api import async_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
WEB = os.path.join(ROOT, "web")
SALIDA = os.path.join(WEB, "img", "vista-previa.png")
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre"]


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def mes_largo(m):
    a, n = m.split("-")
    return f"{MESES[int(n) - 1]} de {a}"


async def main():
    meta = json.load(open(os.path.join(WEB, "datos", "metadatos.json"), encoding="utf-8"))
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Silencioso, directory=WEB))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/index.html#series"
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await nav.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        # tema claro y resumen cerrado: la captura empieza en los paneles
        await pg.add_init_script("localStorage.setItem('bet-tema','light'); localStorage.setItem('bet-resumen','cerrado');")
        await pg.goto(url)
        await pg.wait_for_function("document.querySelectorAll('#grid .panel .chart svg').length >= 2", timeout=120000)
        # solo el título y la primera fila de paneles, sin botones ni notas
        await pg.add_style_tag(content=".top .lede,.toolbar,.tabs,#resumen,.addbar,.panel .acts,.panel .notas,.panel .src"
                                       "{display:none!important}.top{padding-bottom:0!important}")
        await pg.evaluate("rerender()")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=SALIDA)
        await nav.close()
    srv.shutdown()
    meses = [e["mes"] for e in meta["estudios"]]
    alt = ("Series de los barómetros del CIS sin las series electorales (periodo de prohibición de publicación de sondeos)"
           if meta.get("veda") else
           f"Series de intención directa de voto de los barómetros del CIS, de {mes_largo(meses[0])} a {mes_largo(meses[-1])}")
    ruta = os.path.join(WEB, "index.html")
    html = open(ruta, encoding="utf-8").read()
    html = re.sub(r'(<meta property="og:image:alt" content=")[^"]*(")', lambda m: m.group(1) + alt + m.group(2), html)
    open(ruta, "w", encoding="utf-8").write(html)
    print(f"Vista previa: {SALIDA}")


asyncio.run(main())
