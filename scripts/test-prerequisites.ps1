. "$PSScriptRoot\..\desktop\prerequisites.ps1" -Library
function Assert($condition,$message){if(!$condition){throw $message}}
$catalog=@(Get-Prerequisites)
Assert ($catalog.Count -eq 6) 'Six tools expected'
Assert (!($catalog.Id -match 'FiveM')) 'FiveM must be excluded'
$script:installed=@{};$script:invocations=@();$script:bootstrap=0
function Test-Prerequisite($Package){return $script:installed.ContainsKey($Package.Id)}
function Ensure-WinGet{$script:bootstrap++;return 'fixture-winget'}
function Invoke-PrerequisiteInstall($Winget,$Package){$script:invocations+=$Package.Id;$script:installed[$Package.Id]=$true;return 0}
foreach($package in $catalog){$script:installed[$package.Id]=$true}
$result=@(Install-Prerequisites)
Assert ($script:bootstrap -eq 0 -and $script:invocations.Count -eq 0) 'Installed tools must never trigger download or install'
$script:installed=@{};$script:installed['Git.Git']=$true
$result=@(Install-Prerequisites)
Assert ($script:invocations.Count -eq 5) 'Only missing tools installed'
Assert (!($script:invocations -contains 'Git.Git')) 'Existing Git preserved'
Assert (@($result | Where-Object status -eq installed).Count -eq 5) 'Installation verified'
$script:installed=@{};$script:invocations=@()
function Invoke-PrerequisiteInstall($Winget,$Package){$script:invocations+=$Package.Id;if($Package.Id -eq 'Git.Git'){return 1603};$script:installed[$Package.Id]=$true;return 0}
$result=@(Install-Prerequisites)
Assert (@($result | Where-Object status -eq failed).Count -eq 1) 'Failure must be reported'
Assert ($script:invocations.Count -eq 6) 'Other installs continue after failure'
$script:invocations=@();$result=@(Install-Prerequisites)
Assert ($script:invocations.Count -eq 1 -and $script:invocations[0] -eq 'Git.Git') 'Retry only missing tools'
$script:installed=@{}
function Ensure-WinGet{throw 'Offline'}
$result=@(Install-Prerequisites)
Assert (@($result | Where-Object status -eq failed).Count -eq 6) 'Bootstrap failure must never pass silently'
Write-Host 'PASS: preinstalled, missing, failure, retry, offline bootstrap, FiveM excluded'
