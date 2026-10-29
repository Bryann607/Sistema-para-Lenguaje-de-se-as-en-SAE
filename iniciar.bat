@echo off
title SenasSJB - servidor local
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\servidor.py %*
  goto fin
)
where python >nul 2>nul
if %errorlevel%==0 (
  python tools\servidor.py %*
  goto fin
)
echo No se encontro Python. Instalalo desde https://www.python.org/downloads/
echo (marca la casilla "Add Python to PATH") y vuelve a ejecutar este archivo.
pause
:fin
pause
