"""Genera data/dataset/manifest.json con los datasets (.json / .json.gz) de la carpeta.

Se ejecuta SOLO cada vez que inicias el servidor local (tools/servidor.py), por eso el
manifest no se sube a Git (así varias personas no generan conflictos).
Uso manual:  python tools/actualizar_manifest.py
"""
import json
from pathlib import Path

CARPETA = Path(__file__).resolve().parent.parent / "data" / "dataset"


def main():
    CARPETA.mkdir(parents=True, exist_ok=True)
    archivos = sorted(p.name for p in CARPETA.iterdir()
                    if p.is_file() and p.name.endswith((".json.gz", ".json")) and p.name != "manifest.json")
    (CARPETA / "manifest.json").write_text(
        json.dumps({"_ayuda": "Generado automáticamente por tools/servidor.py", "archivos": archivos}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    return len(archivos)


if __name__ == "__main__":
    print(f"manifest.json actualizado: {main()} archivo(s)")
