!include nsDialogs.nsh
!include x64.nsh
!macro customPageAfterChangeDir
 Page custom PrerequisitesPage
Function PrerequisitesPage
 !insertmacro MUI_HEADER_TEXT "Outils du dashboard" "Verification et installation automatiques"
 nsDialogs::Create 1018
 Pop $0
 ${NSD_CreateLabel} 0 0 100% 60u "L'installation verifie Node.js/npm, Git, PowerShell 7, Visual Studio Code, Laragon (MySQL) et Spotify.$\r$\n$\r$\nLes logiciels deja presents sont conserves. Les logiciels absents sont telecharges et installes via Microsoft WinGet. FiveM est exclu."
 Pop $0
 ${NSD_CreateLabel} 0 70u 100% 55u "Une connexion Internet est necessaire pour les logiciels manquants. Windows peut demander une autorisation administrateur.$\r$\n$\r$\nLes conditions de licence des logiciels installes s'appliquent. Laragon peut demander une activation selon son usage."
 Pop $0
 nsDialogs::Show
FunctionEnd
!macroend
!macro customInstall
 DetailPrint "Verification des outils (FiveM exclu)..."
 prereq_retry:
 ${DisableX64FSRedirection}
 nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\prerequisites.ps1"'
 Pop $0
 ${EnableX64FSRedirection}
 ${If} $0 != 0
  IfSilent prereq_fail
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Certains outils n'ont pas pu etre installes. Verifie la connexion Internet et les autorisations Windows.$\r$\nJournal : %LOCALAPPDATA%\LeStitcheur Control\installer\prerequisites.log$\r$\n$\r$\nReessayer relance uniquement les outils manquants. Annuler arrete cette installation ; le dashboard peut deja etre copie." IDRETRY prereq_retry
  prereq_fail:
  SetErrorLevel 1
  Abort "Installation des prerequis incomplete. Consulte le journal puis relance le Setup."
 ${EndIf}
!macroend

