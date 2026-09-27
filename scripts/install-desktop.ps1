param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$installer = Join-Path $projectRoot ('release\LeStitcheur-Control-Setup-' + $package.version + '.exe')
if (-not (Test-Path -LiteralPath $installer)) { throw 'Compile le programme avec npm run desktop:build avant de lancer cette installation.' }
$dataDir = Join-Path $env:APPDATA 'LeStitcheur Control'
$settingsFile = Join-Path $dataDir 'settings.json'
$sourceSettings = Join-Path $projectRoot '.local\settings.json'
[IO.Directory]::CreateDirectory($dataDir) | Out-Null
if (-not (Test-Path -LiteralPath $settingsFile) -and (Test-Path -LiteralPath $sourceSettings)) {
    # Copy encrypted DPAPI values unchanged, under the same Windows account.
    $null = Get-Content -LiteralPath $sourceSettings -Raw | ConvertFrom-Json
    Copy-Item -LiteralPath $sourceSettings -Destination $settingsFile
    Write-Output 'Reglages existants importes dans le profil Windows.'
}
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\LeStitcheur Control'
if (Test-Path -LiteralPath $settingsFile) {
    $null = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
    Copy-Item -LiteralPath $settingsFile -Destination ($settingsFile + '.pre-update') -Force
}
# NSIS requires /D to be the last argument, without enclosing quotes.
$process = Start-Process -FilePath $installer -ArgumentList ('/S /D=' + $installDir) -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw ('Installation echouee : ' + $process.ExitCode) }
$exe = Join-Path $installDir 'LeStitcheur Control.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Executable installe introuvable.' }
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'LeStitcheur Control.lnk'))
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $exe + ',0'
$shortcut.Description = 'Serveurs, projets et musique - LeStitcheur Control'
$shortcut.Save()
Write-Output ('Application installee : ' + $exe)
Write-Output ('Raccourci : ' + (Join-Path $desktop 'LeStitcheur Control.lnk'))
if (-not $NoLaunch) { Start-Process -FilePath $exe -WindowStyle Hidden }
