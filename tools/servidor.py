"""Servidor local de SenasSJB.

Uso:  python tools/servidor.py          -> abre el módulo de usuario
        python tools/servidor.py admin    -> abre la administración

- Busca un puerto libre (8000, 8001, ...), así no choca con un servidor viejo que siga abierto.
- Siempre sirve la carpeta de ESTE proyecto, sin importar desde dónde lo ejecutes.
- Corrige los tipos de archivo (.js, .css, .json...) que en algunos Windows salen mal y dejan la página en blanco.
- Desactiva la caché para que siempre veas la última versión.
"""
import functools
import http.server
import sys
import threading
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

import actualizar_manifest  # noqa: E402  (misma carpeta tools/)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
        ".json": "application/json", ".html": "text/html; charset=utf-8",
        ".wasm": "application/wasm", ".gz": "application/gzip", ".png": "image/png",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    pagina = "admin.html" if "admin" in sys.argv[1:] else ""
    handler = functools.partial(Handler, directory=str(RAIZ))
    servidor, puerto = None, None
    for puerto in range(8000, 8030):
        try:
            servidor = http.server.ThreadingHTTPServer(("127.0.0.1", puerto), handler)
            break
        except OSError:
            continue
    if servidor is None:
        print("No se encontró ningún puerto libre entre 8000 y 8029. Cierra otras ventanas del servidor.")
        sys.exit(1)

    n_datasets = actualizar_manifest.main()
    base = f"http://localhost:{puerto}"
    print("=" * 62)
    print(" SenasSJB - servidor local en marcha")
    print(f" Carpeta servida : {RAIZ}")
    print(f" Datasets locales: {n_datasets} archivo(s) en data/dataset/")
    print(f" Usuario         : {base}/")
    print(f" Administración  : {base}/admin.html")
    print(" Para detenerlo cierra esta ventana o pulsa Ctrl + C")
    print("=" * 62)
    threading.Timer(1.0, webbrowser.open, [f"{base}/{pagina}"]).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
