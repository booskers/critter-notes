; Updates from inside the app (updater.js runs this installer with --updated --force-run): no questions, only the progress
; bar, and the app starts again by itself. A first install still asks who it's for, where it goes, and offers to start it.
; (electron-builder includes build/installer.nsh in the installer; the same file ships with Critter VTT, Critter Sounds and Critter Notes.)

; an update keeps the kind of install there already is: just for this user (the usual one) needs no question
!macro customInstallMode
  ${if} ${isUpdated}
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $0 != ""
      StrCpy $isForceCurrentInstall "1"
    ${endif}
  ${endif}
!macroend

; the finish page only for a first install; an update starts the app when it's done
!macro customFinishPage
  Function critterStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "critterStartApp"
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInstall
  ${if} ${isUpdated}
  ${andIfNot} ${Silent}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
  ${endif}
!macroend
