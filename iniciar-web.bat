@echo off
setlocal

cd /d "%~dp0"

set "NODEJS=%ProgramFiles%\nodejs"
if not exist "%NODEJS%\node.exe" (
  echo No se encuentra Node.js en "%NODEJS%"
  echo Instala Node LTS desde https://nodejs.org/ y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

set "PATH=%NODEJS%;%PATH%"

if not exist "node_modules\" (
  echo Instalando dependencias...
  call "%NODEJS%\npm.cmd" install
  if errorlevel 1 (
    echo Error al instalar dependencias.
    pause
    exit /b 1
  )
)

start "Servidor Dontorrent" cmd /k "cd /d "%~dp0" && set PATH=%NODEJS%;%%PATH%% && npm start"
timeout /t 3 >nul
start "" "http://localhost:3000"
