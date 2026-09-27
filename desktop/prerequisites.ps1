param([switch]$CheckOnly,[switch]$Library)
$ErrorActionPreference='Stop'
function Get-Prerequisites {
 @(
  @{Id='OpenJS.NodeJS.LTS';Name='Node.js et npm';Command='node.exe';Pattern='^Node\.js';Paths=@("$env:ProgramFiles\nodejs\node.exe")},
  @{Id='Git.Git';Name='Git';Command='git.exe';Pattern='^Git( version)? ';Paths=@("$env:ProgramFiles\Git\cmd\git.exe","$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")},
  @{Id='Microsoft.PowerShell';Name='PowerShell 7';Command='pwsh.exe';Pattern='^PowerShell 7';Paths=@("$env:ProgramFiles\PowerShell\7\pwsh.exe")},
  @{Id='Microsoft.VisualStudioCode';Name='Visual Studio Code';Command='code.cmd';Pattern='^Microsoft Visual Studio Code';Paths=@("$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe","$env:ProgramFiles\Microsoft VS Code\Code.exe")},
  @{Id='LeNgocKhoa.Laragon';Name='Laragon (MySQL)';Command='laragon.exe';Pattern='^Laragon';Paths=@("$env:SystemDrive\laragon\laragon.exe")},
  @{Id='Spotify.Spotify';Name='Spotify';Command='spotify.exe';Pattern='^Spotify';Paths=@("$env:APPDATA\Spotify\Spotify.exe","$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe")}
 )
}
function Test-Prerequisite($Package) {
 $command=Get-Command $Package.Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if($Package.Id -eq 'OpenJS.NodeJS.LTS'){
  $candidates=@($Package.Paths);if($command){$candidates+= $command.Source}
  foreach($node in $candidates){
   if(Test-Path -LiteralPath $node -PathType Leaf){$directory=Split-Path $node;if((Test-Path -LiteralPath (Join-Path $directory 'npm.cmd')) -or (Test-Path -LiteralPath (Join-Path $directory 'node_modules\npm\bin\npm-cli.js'))){return $true}}
  }
  return $false
 }
 if($command){return $true}
 foreach($candidate in $Package.Paths){if(Test-Path -LiteralPath $candidate -PathType Leaf){return $true}}
 # Registry covers custom installation directories without recursively searching disks.
 foreach($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')){
  if(Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match $Package.Pattern }){return $true}
 }
 if($Package.Id -eq 'Spotify.Spotify' -and (Get-AppxPackage -Name SpotifyAB.SpotifyMusic -ErrorAction SilentlyContinue)){return $true}
 # Preserve a portable Laragon already configured in the dashboard.
 if($Package.Id -eq 'LeNgocKhoa.Laragon'){
  $settings=Join-Path $env:APPDATA 'LeStitcheur Control\settings.json'
  if(Test-Path -LiteralPath $settings){try{$root=(Get-Content -LiteralPath $settings -Raw | ConvertFrom-Json).laragonRoot;if($root -and (Test-Path -LiteralPath (Join-Path $root 'laragon.exe'))){return $true}}catch{}}
 }
 return $false
}
function Find-WinGet {
 $command=Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if($command){return $command.Source}
 $alias=Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
 if(Test-Path -LiteralPath $alias){return $alias}
 return $null
}
function Ensure-WinGet {
 $winget=Find-WinGet
 if($winget){return $winget}
 Write-Host 'Installation du gestionnaire Microsoft WinGet...'
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force | Out-Null
 Install-Module -Name Microsoft.WinGet.Client -Scope CurrentUser -Repository PSGallery -Force -AllowClobber | Out-Null
 Import-Module Microsoft.WinGet.Client
 Repair-WinGetPackageManager -Latest -Force | Out-Null
 $winget=Find-WinGet
 if(!$winget){throw 'WinGet indisponible. Installer App Installer depuis le Microsoft Store puis relancer cet installateur.'}
 return $winget
}
function Invoke-PrerequisiteInstall($Winget,$Package){
 # Exact allowlisted IDs, normal WinGet integrity checks, no forced upgrades/reboots.
 & $Winget install --id $Package.Id --exact --source winget --silent --accept-source-agreements --accept-package-agreements --disable-interactivity 2>&1 | ForEach-Object {Write-Host $_}
 return $LASTEXITCODE
}
function Install-Prerequisites {
 $packages=@(Get-Prerequisites);$results=@();$missing=@()
 $checked=0
 foreach($package in $packages){$checked++;Write-Host ('[Detection '+$checked+'/'+$packages.Count+'] '+$package.Name);if(Test-Prerequisite $package){Write-Host ('Deja present : '+$package.Name);$results+=@{id=$package.Id;status='present'}}else{$missing+=$package;Write-Host ('Absent : '+$package.Name)}}
 if($missing.Count){
  try{$winget=Ensure-WinGet}catch{foreach($package in $missing){$results+=@{id=$package.Id;status='failed';error=$_.Exception.Message}};return $results}
  $processed=0
  foreach($package in $missing){
   $processed++;$started=Get-Date
   Write-Host ('[Installation '+$processed+'/'+$missing.Count+'] '+$package.Name)
   Write-Host ('Installation : '+$package.Name)
   try{
    # Recheck after previous packages (Laragon may bundle development tools).
    if(Test-Prerequisite $package){$results+=@{id=$package.Id;status='present'};continue}
    $code=Invoke-PrerequisiteInstall $winget $package
    $env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
    if($code -notin @(0,3010)){throw ('WinGet a retourne le code '+$code)}
    if(!(Test-Prerequisite $package)){throw 'Installation terminee mais logiciel non detecte. Consulter le journal.'}
    $results+=@{id=$package.Id;status='installed';restartRequired=($code -eq 3010)}
    Write-Host ('[Termine '+$processed+'/'+$missing.Count+'] '+$package.Name+' - '+[math]::Round(((Get-Date)-$started).TotalSeconds)+' secondes')
   }catch{$results+=@{id=$package.Id;status='failed';error=$_.Exception.Message};Write-Host ('Echec : '+$package.Name+' - '+$_.Exception.Message)}
  }
 }
 return $results
}
if($Library){return}
if($CheckOnly){@(Get-Prerequisites | ForEach-Object { [pscustomobject]@{id=$_.Id;name=$_.Name;installed=(Test-Prerequisite $_)} }) | ConvertTo-Json;exit 0}
$logDir=Join-Path $env:LOCALAPPDATA 'LeStitcheur Control\installer'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Transcript -Path (Join-Path $logDir 'prerequisites.log') -Force | Out-Null
try{
 $results=@(Install-Prerequisites)
 ConvertTo-Json -InputObject $results -Depth 4 | Set-Content -LiteralPath (Join-Path $logDir 'prerequisites.json') -Encoding UTF8
 if(@($results | Where-Object status -eq 'failed').Count){exit 1}
 Write-Host 'Tous les prerequis sont disponibles. FiveM est exclu.'
 exit 0
}catch{Write-Host $_.Exception.Message;exit 1}finally{Stop-Transcript | Out-Null}
