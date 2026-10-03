; installer-resources/installer.nsh
;
; Phase 6C — Désinstallateur MAXI EQUIP.
;
; Injecté par electron-builder (build.nsis.include) dans le script NSIS
; généré, pour la passe INSTALLATEUR et la passe DÉSINSTALLATEUR — les
; macros ci-dessous ne sont invoquées côté désinstallateur que par
; assistedInstaller.nsh (customUnWelcomePage, customUnInstall) ; rien
; n'est ajouté côté installateur ici.
;
; Rôle : proposer, à la désinstallation, le choix entre "Conserver mes
; données" et "Supprimer toutes les données locales", avec double
; confirmation explicite avant toute suppression. Ne supprime JAMAIS de
; données côté serveur/cloud : uniquement des fichiers locaux sous
; $APPDATA\${APP_PACKAGE_NAME} (base SQLCipher, sauvegardes locales,
; factures PDF locales, images produits locales, configuration
; persistante) — aucune requête réseau n'est jamais déclenchée ici.

!ifdef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  !include "WinMessages.nsh"

  Var /GLOBAL MaxiDialog
  Var /GLOBAL MaxiRadioConserver
  Var /GLOBAL MaxiRadioSupprimer
  Var /GLOBAL MaxiSupprimerDonnees
!endif

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.PageChoixDonneesCreate un.PageChoixDonneesLeave
!macroend

!ifdef BUILD_UNINSTALLER

Function un.PageChoixDonneesCreate
  StrCpy $MaxiSupprimerDonnees "0"

  nsDialogs::Create 1018
  Pop $MaxiDialog
  ${If} $MaxiDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Données locales de MAXI EQUIP — MAXI EQUIP va être désinstallé. Ce choix ne concerne que les données présentes sur CET ordinateur : les données déjà synchronisées sur le serveur/cloud ne sont jamais concernées."
  Pop $0

  ${NSD_CreateRadioButton} 0 32u 100% 12u "Conserver mes données (recommandé)"
  Pop $MaxiRadioConserver
  ${NSD_SetState} $MaxiRadioConserver ${BST_CHECKED}
  ${NSD_CreateLabel} 12u 45u 88% 24u "Le programme est désinstallé, mais la base de données locale, les factures, les sauvegardes locales et la configuration restent sur cet ordinateur. Une réinstallation ultérieure les retrouvera intactes."
  Pop $0

  ${NSD_CreateRadioButton} 0 74u 100% 12u "Supprimer toutes les données locales"
  Pop $MaxiRadioSupprimer
  ${NSD_CreateLabel} 12u 87u 88% 32u "Supprime définitivement, sur cet ordinateur uniquement, la base de données locale, les factures PDF locales, les sauvegardes locales et les images produits locales. Une confirmation supplémentaire sera demandée avant toute suppression."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function un.PageChoixDonneesLeave
  ${NSD_GetState} $MaxiRadioSupprimer $0
  ${If} $0 == ${BST_CHECKED}
    ; Confirmation n°1 — texte imposé par le cahier des charges (§7) :
    ; rappelle explicitement que les données cloud/serveur déjà
    ; synchronisées ne sont pas concernées par cette action locale.
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Attention : cette action supprimera définitivement les données locales de MAXI EQUIP présentes sur cet ordinateur. Les données déjà synchronisées sur le serveur/cloud ne seront pas supprimées par cette action. Voulez-vous réellement supprimer les données locales ?" \
      IDYES maxi_confirm1_yes
    ${NSD_SetState} $MaxiRadioConserver ${BST_CHECKED}
    ${NSD_SetState} $MaxiRadioSupprimer ${BST_UNCHECKED}
    Abort
    maxi_confirm1_yes:

    ; Confirmation n°2 — avertissement données non synchronisées (§10).
    ; Le désinstallateur NSIS n'a pas accès à la base chiffrée pour
    ; vérifier une file d'attente de synchronisation réelle : cet
    ; avertissement est donc systématique par prudence, et renvoie vers
    ; la fonction de sauvegarde déjà existante de l'application plutôt
    ; que d'introduire un nouveau mécanisme d'export.
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Des données locales n'ont peut-être pas encore été synchronisées avec le serveur. La suppression locale peut entraîner leur perte définitive.$\r$\n$\r$\nPour conserver une copie de sécurité, annulez cette désinstallation et utilisez la fonction de sauvegarde de MAXI EQUIP avant de poursuivre.$\r$\n$\r$\nVoulez-vous réellement continuer la suppression des données locales ?" \
      IDYES maxi_confirm2_yes
    ${NSD_SetState} $MaxiRadioConserver ${BST_CHECKED}
    ${NSD_SetState} $MaxiRadioSupprimer ${BST_UNCHECKED}
    Abort
    maxi_confirm2_yes:

    StrCpy $MaxiSupprimerDonnees "1"
  ${Else}
    StrCpy $MaxiSupprimerDonnees "0"
  ${EndIf}
FunctionEnd

!endif

!macro customUnInstall
  ${if} $MaxiSupprimerDonnees == "1"
    ; Suppression strictement locale — jamais une requête réseau/API,
    ; jamais les données déjà synchronisées sur le serveur/cloud (§8).
    ; Réutilise ${APP_PACKAGE_NAME}, le même define qu'electron-builder
    ; utilise déjà pour localiser $APPDATA\@maxi-equip\electron-app
    ; (nom dérivé du scope npm du package.json) — jamais un chemin codé
    ; en dur ici, pour rester correct même si ce nom venait à changer.
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  ${endif}
!macroend
