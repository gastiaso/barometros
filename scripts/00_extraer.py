"""Extrae de cada ZIP de datos/raw el .sav (a datos/extract/<estudio>/) y los PDF de documentación
(libro de códigos, cuestionario, ficha técnica) a datos/docs/<estudio>/.
Uso: python scripts/00_extraer.py <raíz del proyecto>"""
import glob, os, re, sys, zipfile
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
for z in sorted(glob.glob(os.path.join(ROOT, "datos", "raw", "MD*.zip"))):
    code = re.search(r"MD(\d{4})", os.path.basename(z)).group(1)
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():
            low = n.lower()
            if low.endswith(".sav"):
                zf.extract(n, os.path.join(ROOT, "datos", "extract", code))
            elif low.endswith(".pdf") and re.match(r"^(codigo|cues|ft)", os.path.basename(low)):
                zf.extract(n, os.path.join(ROOT, "datos", "docs", code))
print("ok")
