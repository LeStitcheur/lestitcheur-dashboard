$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Le compilateur .NET Framework Windows est introuvable.' }
$output = Join-Path $projectRoot 'desktop\rdp-host.exe'
$source = Join-Path $projectRoot 'desktop\rdp-host.cs'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:Microsoft.CSharp.dll ('/out:' + $output) $source
if ($LASTEXITCODE -ne 0) { throw 'Compilation du client RDP echouee.' }
Write-Output 'Client RDP Windows compile.'
