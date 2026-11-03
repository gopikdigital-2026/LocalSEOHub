# A3.7.5.3 — Customer Connection Matrix

All states are on the customer Sources page (`/fuentes`); none require internal routes.

| Situation | Customer sees (ES / EN) | Action available |
|---|---|---|
| Not connected | "Sin conectar" / "Not connected" + collapsible "¿Qué permisos pedimos?" / "Which permissions do we request?" (4 lines, read-only note, Page/IG requirements) | Conecta Facebook e Instagram / Connect Facebook and Instagram |
| Waiting for Meta | "Conectando…" + hint | Cancelar conexión / Cancel connection |
| Denied or cancelled at Meta | Friendly explanation + permissions | Reintentar conexión / Retry connection |
| Returned, several Pages | "Falta elegir página" / "Page needed" | Elegir página → dialog (focus, Escape, mobile bottom sheet) |
| Returned, one Page | Auto-selected → connected | — |
| No eligible Pages | Error box: NO_AUTHORIZED_PAGES message | Retry |
| Permission declined | META_PERMISSION_UNAVAILABLE message | Retry |
| Page already used by another business | META_PAGE_ALREADY_ASSIGNED message (no foreign data) | Choose another Page |
| IG already used elsewhere | META_INSTAGRAM_ALREADY_ASSIGNED message | Choose another Page |
| Connected, IG professional | Facebook: Page name · "Activo"/"Active"; Instagram: @username · "Activo"/"Active" | Disconnect (confirm) |
| Connected, no IG / not professional | Facebook "Activo"; Instagram message · "No disponible"/"Unavailable" | Disconnect |
| Connected, IG permission missing or API error | Instagram message · "Revisar"/"Check" | Reconnect via Retry on expiry / Disconnect |
| Session expired | "Vuelve a conectar tu cuenta" / "Reconnect your account" + permissions | Volver a conectar / Reconnect |
| Invalid / expired return link | Callback error page in ES/EN | Volver a fuentes / Back to sources |
| Meta app not available | "La conexión con Meta todavía no está disponible." | — |
| Publishing step | Hidden for customers; visible only to verified operators | — |
