$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'create-icon.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Generation de l embleme echouee.' }
