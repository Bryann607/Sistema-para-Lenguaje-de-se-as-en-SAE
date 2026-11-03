"""Arma la carpeta _site con SOLO el módulo de usuario (lo que se publica en GitHub Pages).

Uso:  python tools/armar_sitio.py              -> copia los archivos a _site/
      python tools/armar_sitio.py --verificar  -> solo comprueba, no copia nada

Por qué existe: antes la lista de archivos a publicar estaba escrita a mano en pages.yml y, al agregar
un módulo nuevo (frases.js, voz.js…), el sitio publicado se rompía con un error 404. Ahora los módulos
necesarios se calculan solos siguiendo los `import` a partir de js/main.js.

Reglas que verifica (si fallan, el programa termina con error y GitHub no publica nada):
  1. Todo archivo local que usa index.html o un módulo público existe.
  2. Ningún módulo de administración (admin.js, auth.js, datos.js, entrenar.js, videos.js,
     videoimport.js, nube.js, nubeui.js, db.js, dataset.js) llega al sitio público.
"""
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "_site"
ADMIN = {"admin.js", "auth.js", "datos.js", "entrenar.js", "videos.js", "videoimport.js",
         "nube.js", "nubeui.js", "db.js", "dataset.js"}
# import estático:  import ... from './x.js'   |   export ... from './x.js'   |   import './x.js'
IMPORT = re.compile(r"""(?:import|export)\s[^;'"]*?from\s*['"](\.{1,2}/[^'"]+)['"]|import\s*['"](\.{1,2}/[^'"]+)['"]""")


def modulos_publicos():
    pendientes, vistos = [RAIZ / "js" / "main.js"], {}
    while pendientes:
        ruta = pendientes.pop()
        if ruta in vistos:
            continue
        if not ruta.exists():
            raise SystemExit(f"ERROR: falta el módulo {ruta.relative_to(RAIZ)} (lo importa otro archivo público).")
        texto = ruta.read_text(encoding="utf-8")
        vistos[ruta] = texto
        for m in IMPORT.finditer(texto):
            destino = (ruta.parent / (m.group(1) or m.group(2))).resolve()
            pendientes.append(destino)
    return vistos


def main():
    solo_verificar = "--verificar" in sys.argv
    modulos = modulos_publicos()
    nombres = sorted(p.name for p in modulos)

    colados = [n for n in nombres if n in ADMIN]
    if colados:
        raise SystemExit("ERROR: un módulo público importa código de administración: " + ", ".join(colados)
                         + ". Revisa los import de main.js / traductor.js / app.js / model.js.")

    index = (RAIZ / "index.html").read_text(encoding="utf-8")
    locales = set(re.findall(r"""(?:src|href)=["']((?:js|css|assets|data|model|audio)/[^"'#?]+)["']""", index))
    faltan = sorted(r for r in locales if not (RAIZ / r).exists())
    if faltan:
        raise SystemExit("ERROR: index.html usa archivos que no existen: " + ", ".join(faltan))

    if solo_verificar:
        print("Módulos públicos:", ", ".join(nombres))
        print("OK: el sitio público es consistente (nada de administración, nada faltante).")
        return

    if DESTINO.exists():
        shutil.rmtree(DESTINO)
    (DESTINO / "js").mkdir(parents=True)
    (DESTINO / "data").mkdir()
    shutil.copy(RAIZ / "index.html", DESTINO / "index.html")
    for carpeta in ("css", "assets", "model", "audio"):
        if (RAIZ / carpeta).exists():
            shutil.copytree(RAIZ / carpeta, DESTINO / carpeta)
    for archivo in sorted((RAIZ / "data").glob("*.json")):          # vocabulario, respuestas, frases…; NO data/dataset/
        shutil.copy(archivo, DESTINO / "data" / archivo.name)
    for ruta in modulos:
        shutil.copy(ruta, DESTINO / "js" / ruta.name)
    print("Sitio público armado en _site/")
    print("  js/  :", ", ".join(nombres))
    print("  data/:", ", ".join(sorted(p.name for p in (DESTINO / "data").iterdir())))


if __name__ == "__main__":
    main()
