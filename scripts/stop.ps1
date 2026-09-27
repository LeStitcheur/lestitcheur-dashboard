$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.local\panel.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'Aucune session du lanceur a arreter.'; exit 0 }
$panelPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$panelProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $panelPid"
if (-not $panelProcess) { Remove-Item -LiteralPath $pidFile; Write-Output 'Le panel est deja arrete.'; exit 0 }
$expectedEntry = Join-Path $projectRoot 'server\index.js'
if ($panelProcess.Name -ne 'node.exe' -or $panelProcess.CommandLine -notlike ('*"' + $expectedEntry + '"*')) {
    throw 'Ce PID ne correspond plus au panel attendu. Aucun processus arrete.'
}
Stop-Process -Id $panelPid
Remove-Item -LiteralPath $pidFile
Write-Output 'LeStitcheur Control est arrete. Les services doivent etre geres separement dans txAdmin ou Windows.'
