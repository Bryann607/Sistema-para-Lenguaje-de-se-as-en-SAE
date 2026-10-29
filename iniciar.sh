#!/usr/bin/env sh
# Inicia el servidor local (macOS / Linux).  ./iniciar.sh  |  ./iniciar.sh admin
cd "$(dirname "$0")" || exit 1
exec python3 tools/servidor.py "$@"
