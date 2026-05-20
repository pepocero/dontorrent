# Arranca el servidor local aunque npm no este en el PATH de Cursor
$ErrorActionPreference = 'Stop'
$nodejs = Join-Path ${env:ProgramFiles} 'nodejs'
$npm = Join-Path $nodejs 'npm.cmd'
$node = Join-Path $nodejs 'node.exe'

if (-not (Test-Path $node)) {
  Write-Host 'No se encuentra Node.js en' $nodejs
  Write-Host 'Instala Node LTS desde https://nodejs.org/'
  exit 1
}

$env:Path = "$nodejs;$env:Path"
Set-Location $PSScriptRoot

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Instalando dependencias...'
  & $npm install
}

Write-Host 'Iniciando servidor en http://localhost:3000'
& $node server.js
