param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$port = 4317
$panelUrl = "http://127.0.0.1:$port"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 22.12 ou plus recent est requis. Installe-le depuis https://nodejs.org.' }
$nodeVersion = (& $nodeCommand.Source --version).TrimStart('v')
if ([version]$nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12 ou plus recent est requis.' }
function Test-Panel {
    try {
        $state = Invoke-RestMethod -Uri "$panelUrl/api/bootstrap" -TimeoutSec 2
        return ($state.app -eq 'lestitcheur-control')
    } catch { return $false }
}
if (Test-Panel) { if (-not $NoBrowser) { Start-Process $panelUrl }; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Installation des dependances impossible.' }
}
$indexFile = Join-Path $projectRoot 'dist\index.html'
$needsBuild = -not (Test-Path -LiteralPath $indexFile)
if (-not $needsBuild) {
    $builtAt = (Get-Item -LiteralPath $indexFile).LastWriteTimeUtc
    $newerFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'),(Join-Path $projectRoot 'public') -File -Recurse | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1
    $needsBuild = $null -ne $newerFiles
}
if ($needsBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible. Consulte les messages ci-dessus.' }
}
$logDirectory = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$entry = Join-Path $projectRoot 'server\index.js'
$nodeProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $entry + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'panel.log') -RedirectStandardError (Join-Path $logDirectory 'panel-error.log')
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (Test-Panel) { $ready = $true; break }
    if ($nodeProcess.HasExited) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "Le panel n'a pas demarre. Consulte .local\panel-error.log. Le port $port est peut-etre occupe." }
Set-Content -LiteralPath (Join-Path $logDirectory 'panel.pid') -Value $nodeProcess.Id
if (-not $NoBrowser) { Start-Process $panelUrl }
