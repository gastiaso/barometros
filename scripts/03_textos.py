"""Pasa a texto la documentación de cada estudio (requiere poppler: pdftotext, pdfinfo).
  libro de códigos -> codigo.txt (pdftotext -layout)
  cuestionario     -> cues.txt   (dos columnas: mitad izquierda y luego derecha de cada página)
  ficha técnica    -> ft.txt     (pdftotext -layout)
Uso: python scripts/03_textos.py <raíz del proyecto>"""
import glob, os, re, subprocess, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

def columnas(pdf, out):
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    w, h = map(float, re.search(r"Page size:\s+([\d.]+) x ([\d.]+)", info).groups())
    txt = []
    for p in range(1, pages + 1):
        for x in (0, w / 2):
            r = subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-r", "72", "-x", str(int(x)), "-y", "0",
                                "-W", str(int(w / 2) + 1), "-H", str(int(h) + 1), pdf, "-"], capture_output=True, text=True)
            txt.append(r.stdout)
    open(out, "w", encoding="utf-8").write("\n".join(txt))

for d in sorted(glob.glob(os.path.join(ROOT, "datos", "docs", "*"))):
    pdfs = glob.glob(os.path.join(d, "*"))
    for p in pdfs:
        b = os.path.basename(p).lower()
        if not b.endswith(".pdf"):
            continue
        if b.startswith("codigo"):
            subprocess.run(["pdftotext", "-layout", p, os.path.join(d, "codigo.txt")])
        elif b.startswith("cues"):
            columnas(p, os.path.join(d, "cues.txt"))
        elif b.startswith("ft"):
            subprocess.run(["pdftotext", "-layout", p, os.path.join(d, "ft.txt")])
print("ok")
