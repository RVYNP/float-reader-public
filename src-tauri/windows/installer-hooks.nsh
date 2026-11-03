; Float Reader appears in Explorer's "Open with" for its document types but never
; takes over the default handler (PRD packaging gate: Open With registration must
; not take defaults).
;
; Tauri's APP_ASSOCIATE (FileAssociation.nsh) points ".ext" at the ProgID and keeps
; the previous default in the "<ProgID>_backup" value; its APP_UNASSOCIATE restores
; the default from that value. After install the previous default is put back and
; the ProgID is offered through OpenWithProgids instead; the backup value stays so
; the uninstaller restores the same default. After uninstall the leftovers go.
;
; The ProgID and extensions mirror bundle.fileAssociations in tauri.conf.json.
!define FLOAT_READER_PROGID "Reading document"

!macro FLOAT_READER_OFFER_OPEN_WITH EXT
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "${FLOAT_READER_PROGID}_backup"
  ${If} $R0 == ""
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  ${Else}
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R0"
  ${EndIf}
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${FLOAT_READER_PROGID}" ""
!macroend

!macro FLOAT_READER_REMOVE_OPEN_WITH EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${FLOAT_READER_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${FLOAT_READER_PROGID}_backup"
  ; APP_UNASSOCIATE writes an empty default when there was none before install.
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" ""
  ${If} $R0 == ""
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
  ${EndIf}
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro FLOAT_READER_OFFER_OPEN_WITH "pdf"
  !insertmacro FLOAT_READER_OFFER_OPEN_WITH "epub"
  !insertmacro FLOAT_READER_OFFER_OPEN_WITH "md"
  !insertmacro FLOAT_READER_OFFER_OPEN_WITH "markdown"
  !insertmacro FLOAT_READER_OFFER_OPEN_WITH "txt"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro FLOAT_READER_REMOVE_OPEN_WITH "pdf"
  !insertmacro FLOAT_READER_REMOVE_OPEN_WITH "epub"
  !insertmacro FLOAT_READER_REMOVE_OPEN_WITH "md"
  !insertmacro FLOAT_READER_REMOVE_OPEN_WITH "markdown"
  !insertmacro FLOAT_READER_REMOVE_OPEN_WITH "txt"
  !insertmacro UPDATEFILEASSOC
!macroend
