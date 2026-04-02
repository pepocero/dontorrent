@echo off
setlocal

cd /d "%~dp0"

start "Servidor" cmd /k "npm start"
timeout /t 3 >nul
start "" "http://localhost:3000"
