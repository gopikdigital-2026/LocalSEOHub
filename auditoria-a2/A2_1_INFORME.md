# LocalSEOHub · FIX A2.1 · Cierre de funciones heredadas y eliminación del riesgo SSRF

- **Base:** v0.7.3 auditada en A1 (`localseohub-v073.zip` = `localseohub-auditA1.zip`).
- **Proyecto Supabase:** `kdnrnibiwgijrejkizrk`.
- **Fecha:** 2026-10-10.
- **Alcance:** F-01 (resuelto), F-08 (resuelto), F-09 (resuelto en su parte IA) y F-03 (reducido). No se ha tocado ningún otro hallazgo.
- **Sin cambios en:** Stripe, Google OAuth/GBP, tablas, permisos, precios, registro, pruebas gratuitas y datos.
- **Llamadas a OpenAI:** ninguna.

> Este FIX no declara LocalSEOHub listo para lanzamiento. A2.2 no se ha iniciado.

---

## 1. Inventario de funciones revisadas

Comprobaciones hechas para cada función candidata:

- **(a) Aplicación:** referencias en `src/`, `public/` e `index.html`. Incluye las llamadas dinámicas: `invokeEdge(fnName)` en `reality-engine/engine.ts` solo recibe `analyze-website`, `gbp-oauth-start` y `gbp-sync`.
- **(b) Otras Edge Functions:** si alguna la referencia.
- **(c) Base de datos:**
  - Funciones SQL (`pg_proc.prosrc`): 0 coincidencias.
  - Extensiones `pg_cron`, `pg_net` y `http`: no instaladas, así que no hay tareas programadas ni llamadas HTTP desde la BD.
  - Migraciones: una sola mención, como texto de ejemplo en un comentario (`premium:generate-seo:<user id>`).
- **(d) Registro, onboarding, Stripe y Premium:**
  - El registro usa solo `signup-instant`.
  - Onboarding y primer valor usan datos locales y Supabase, sin estas funciones.
  - Facturación usa `stripe-billing`.
  - Premium usa `authorize_premium_request` (SQL), que no depende del nombre de función.
- **(e) Despliegue previo:** `list_edge_functions` las mostraba todas como `ACTIVE`.

| Función | (a) App | (b) Otras fn | (c) BD / cron | (d) Registro, onboarding, Stripe, Premium | Antes de A2.1 | Decisión |
|---|---|---|---|---|---|---|
| analyze-competitor-url | Solo tests | No | No | No | ACTIVE: IA y descarga de URL sin validar (SSRF F-01) | **Retirada (410)** |
| audit-maps-profile | Solo tests | No | No | No | ACTIVE: IA, fuga `errBody` | **Retirada (410)** |
| audit-reviews | Solo tests | No | No | No | ACTIVE: IA | **Retirada (410)** |
| execute-tip-content | Solo tests | No | No | No | ACTIVE: IA | **Retirada (410)** |
| generate-business-audit | Solo tests | No | No | No | ACTIVE: IA | **Retirada (410)** |
| generate-content-plan | Solo tests | No | No | No | ACTIVE: IA, fuga `errBody` | **Retirada (410)** |
| generate-countermeasure | Solo tests | No | No | No | ACTIVE: IA, `verify_jwt=false` | **Retirada (410)** |
| generate-gbp-description | Solo tests | No | No | No | ACTIVE: IA | **Retirada (410)** |
| generate-geo-audit | Solo tests | No | No | No | ACTIVE: IA y descarga, `verify_jwt=false` | **Retirada (410)** |
| generate-pitch | Solo tests | No | No | No | ACTIVE: IA, fuga `err.message` | **Retirada (410)** |
| generate-seo | Solo tests (copia de referencia de `entitlement.ts`) | No | Solo comentario | No | ACTIVE: IA, fuga `errBody` | **Retirada (410)** |
| generate-voice-script | Solo tests | No | No | No | ACTIVE: IA, `verify_jwt=false` | **Retirada (410)** |
| scan-directories | Solo tests | No | No | No | ACTIVE: IA, fuga `errBody` | **Retirada (410)** |
| simulate-campaign | Solo tests | No | No | No | ACTIVE: IA | **Retirada (410)** |

Las 14 candidatas eran innecesarias. Ninguna tenía uso real.

## 2. Funciones desactivadas y mecanismo

**Mecanismo:**
- Cada `index.ts` se ha sustituido por un bloqueo mínimo que responde `410 Gone` con `{"error":"gone"}`.
- Sigue el mismo patrón que ya usan `stripe-checkout` y `stripe-cancel-subscription`.
- Las peticiones `OPTIONS` (CORS) responden 200.
- Se ha eliminado el `entitlement.ts` de cada carpeta porque ya no se usa.
- El bloqueo no importa nada, no lee secretos, no lee el cuerpo, no consulta la BD, no hace `fetch` y no llama a IA.

**Por qué 410 y no borrado:**
- Es reversible: basta con restaurar el código y volver a desplegar.
- Es verificable desde fuera: devuelve un código explícito, no un 404 ambiguo.
- La entrada de `config.toml` se mantiene sin cambios.
- Borrar con `delete_edge_function` también eliminaría la carpeta local y dejaría un 404 indistinguible de un error de ruta.

**Despliegue:** `deploy_edge_functions` desplegó exactamente las 14 funciones. Ninguna protegida se volvió a desplegar.

**Datos:** no se ha borrado ningún dato. Las tablas que usaban estas funciones (`saved_seo_results`, etc.) siguen intactas.

### Cómo restaurar una función

1. Extraer `supabase/functions/<slug>/` (`index.ts` y `entitlement.ts`) de `localseohub-v073.zip` o `localseohub-auditA1.zip`.
2. Copiarla sobre la carpeta actual.
3. Llamar a `deploy_edge_functions`. Detecta el cambio y despliega solo esa función.
4. Volver a añadir el slug a `PREMIUM_FUNCTIONS` y quitarlo de `RETIRED_FUNCTIONS` en `premiumAccess.test.ts`.
5. **Aviso:** restaurar `analyze-competitor-url` o `generate-geo-audit` reabre F-01. Solo se debería hacer después de añadir la validación de `analyze-website/urlSafety.ts`.

## 3. Funciones conservadas y motivo

| Función | Motivo | Cambios |
|---|---|---|
| weekly-content | v0.7.1, usada por la app | Ninguno (idéntica a v0.7.3) |
| business-improvement | v0.7.2, usada por la app | Ninguno |
| analyze-website | Conexión de la web, usada por la app | Ninguno |
| signup-instant | Registro | Ninguno |
| stripe-billing / stripe-webhook | Facturación | Ninguno |
| gbp-oauth-start / gbp-oauth-callback / gbp-sync / gbp-list-locations | Google Business Profile | Ninguno |
| admin-stats | Usada por el panel admin heredado. F-04 queda pendiente de su propio FIX | Ninguno |
| stripe-checkout / stripe-cancel-subscription | Ya retiradas (410) antes de A2.1 | Ninguno |

**v0.7.3, respuestas preparadas:** no usa Edge Function. Trabaja con la tabla `prepared_replies` y RPC, y no se ha tocado.

## 4. Evidencia del estado desplegado

Peticiones HTTP reales contra `https://<proyecto>.supabase.co/functions/v1/<slug>` después del despliegue.

- **Cuerpo usado:** una URL pública inocua (`https://example.com`).
- **Direcciones internas:** no se probó ninguna, como pedía la especificación.

### 4.1 Funciones retiradas: POST con clave pública y cuerpo funcional

Las 14 devuelven **`410 {"error":"gone"}`**, con tiempos entre 0,35 y 0,47 s.

La prueba principal de que no hay llamadas externas es el código desplegado (G8): no lee el cuerpo y no hace ningún `fetch`. El tiempo bajo y constante es una señal que lo confirma: una llamada real a OpenAI o una descarga de URL no podría responder siempre así. El tiempo de las versiones originales no se midió, para no llamar a OpenAI.

| Función | Código | Tiempo |
|---|---|---|
| analyze-competitor-url | 410 | 0,47 s |
| audit-maps-profile | 410 | 0,37 s |
| audit-reviews | 410 | 0,38 s |
| execute-tip-content | 410 | 0,38 s |
| generate-business-audit | 410 | 0,35 s |
| generate-content-plan | 410 | 0,41 s |
| generate-countermeasure | 410 | 0,39 s |
| generate-gbp-description | 410 | 0,37 s |
| generate-geo-audit | 410 | 0,38 s |
| generate-pitch | 410 | 0,36 s |
| generate-seo | 410 | 0,39 s |
| generate-voice-script | 410 | 0,38 s |
| scan-directories | 410 | 0,36 s |
| simulate-campaign | 410 | 0,37 s |

### 4.2 Funciones retiradas: otras variantes (muestra)

| Función | POST sin token | GET con `?url=` | OPTIONS |
|---|---|---|---|
| analyze-competitor-url | 401 (la plataforma rechaza la petición antes de llegar al código, `verify_jwt=true`) | 410 | 200 |
| generate-seo | 401 (igual) | 410 | 200 |
| generate-countermeasure | 410 | 410 | 200 |
| generate-geo-audit | 410 | 410 | 200 |
| generate-voice-script | 410 | 410 | 200 |

### 4.3 Funciones activas: siguen desplegadas y operativas

Solo se usaron peticiones que no consumen recursos.

- **Stripe y registro:** se probó solo `OPTIONS`, para no tocar Stripe ni crear usuarios.
- **Resto:** POST con la clave pública pero sin sesión de usuario, para comprobar que su propio control de acceso responde.

| Función | OPTIONS | POST sin sesión |
|---|---|---|
| weekly-content | 200 | 401 `unauthorized` |
| business-improvement | 200 | 401 `unauthorized` |
| analyze-website | 200 | 401 `unauthorized` |
| gbp-oauth-start | 200 | 401 |
| gbp-sync | 200 | 400 (valida el cuerpo antes de la sesión; ya era así, ver R-6) |
| gbp-list-locations | 200 | 401 `NOT_AUTHENTICATED` |
| signup-instant | 200 | (no probado: crearía un usuario) |
| stripe-billing | 200 | (no probado: Stripe compartido) |
| stripe-webhook | 405 (solo acepta POST; ya era así) | (no probado) |
| gbp-oauth-callback | 200 | (no probado) |
| admin-stats | 200 | (no probado) |

### 4.4 Efectos secundarios de las pruebas

Consultas en la BD después de las pruebas:

- **0** usuarios nuevos.
- **0** filas nuevas en `edge_rate_limits`.
- Los únicos eventos nuevos en `analytics_events` son 28 `page_view` de visitas del navegador. Ninguno viene de estas pruebas.

## 5. Pruebas ejecutadas

### 5.1 Calidad, comparada con la línea base de A1

| Comprobación | A1 (v0.7.3) | A2.1 | Resultado |
|---|---|---|---|
| Vitest | 423/423 (22 archivos) | **423/423 (22 archivos)** | Igual |
| TypeScript (`tsc -p tsconfig.app.json`) | 20 errores, todos TS6133 | **20 errores, todos TS6133** | Sin errores nuevos |
| ESLint | 23 errores / 7 avisos | **23 errores / 7 avisos** | Sin errores nuevos |
| Build | OK | **OK** | Igual |

**Por qué el total de tests sigue en 423:** el test G2 pasa de 15 casos a 1 (`analyze-website`, la única función premium heredada que queda) y se añade G8 con 14 casos, uno por función retirada. G8 comprueba que cada carpeta contiene solo `index.ts`, que responde 410 y que no tiene `import`, `fetch(`, `Deno.env`, `req.json(`, `createClient`, `requirePremium` ni `openai`.

### 5.2 Pruebas obligatorias de la especificación

| # | Prueba | Evidencia | Resultado |
|---|---|---|---|
| 1 | Los endpoints retirados no llaman a OpenAI | El código desplegado no contiene IA (G8). El tiempo de respuesta es de unos 0,4 s y constante (4.1) | OK |
| 2 | No pueden descargar URLs | Ni `fetch` ni lectura del cuerpo (G8). La URL enviada se ignora y la respuesta es 410 (4.1, 4.2) | OK |
| 3 | No aceptan solicitudes funcionales | 410 con POST, GET y sin token (4.1, 4.2) | OK |
| 4 | Las funciones activas siguen operativas | OPTIONS 200 y su propio control de acceso responde (4.3). Su código no ha cambiado (sección 6) | OK, sin prueba funcional completa con usuario real |
| 5 | Registro y onboarding no dependen de ellas | Inventario 1 (a) y (d). `signup-instant` sigue OPTIONS 200 y su código no ha cambiado | OK |
| 6 | v0.7.1, v0.7.2 y v0.7.3 intactas | Código del cliente, funciones y migraciones idénticos. Pasan los tests de las tres mejoras (incluidos `weeklyContent`, `improvement` y `preparedReplies`) | OK |
| 7 | Sin regresiones | Los 423 tests pasan; TypeScript, ESLint y build igual que en A1 | OK |

## 6. Comparación de archivos protegidos

Se ha comparado archivo por archivo con `localseohub-v073.zip`.

**Idénticos:**
- **Funciones:** `weekly-content`, `business-improvement`, `analyze-website`, `signup-instant`, `stripe-billing`, `stripe-webhook`, `gbp-oauth-start`, `gbp-oauth-callback`, `gbp-sync`, `gbp-list-locations`, `admin-stats`, `stripe-checkout` y `stripe-cancel-subscription`.
- `supabase/config.toml`.
- `supabase/migrations/`: todas.
- Todo el código del cliente fuera de las carpetas `__tests__`.

**Archivos cambiados (lista completa):**
- `supabase/functions/<14 retiradas>/index.ts`: sustituidos por el bloqueo 410.
- `supabase/functions/<14 retiradas>/entitlement.ts`: eliminados.
- `src/features/billing/__tests__/premiumAccess.test.ts`:
  - Importa `entitlement.ts` desde `analyze-website`, porque `generate-seo` ya no lo tiene.
  - Separa `PREMIUM_FUNCTIONS`, `ENTITLEMENT_COPIES` y `RETIRED_FUNCTIONS`.
  - Añade G8.
- `src/features/improvement/__tests__/improvement.test.ts` y `src/features/weekly-content/__tests__/weeklyContent.test.ts`: una línea cada uno. La copia de referencia de `entitlement.ts` pasa de `generate-seo` a `analyze-website`, que es byte a byte el mismo archivo (md5 `3d6cb2cb…` en A1). Las comprobaciones de las mejoras no cambian.

**Base de datos:**
- Sin migraciones nuevas.
- Sin cambios de permisos ni de datos.
- Los 8 avisos de seguridad de A1 no cambian, porque A2.1 no los aborda.

## 7. Estado de los hallazgos de A1

| Hallazgo | Estado tras A2.1 |
|---|---|
| F-01 SSRF en `analyze-competitor-url` | **Resuelto.** El endpoint desplegado responde 410 sin leer la petición. El código vulnerable ya no está en el repositorio. |
| F-08 Fuga de errores del proveedor IA | **Resuelto.** Las 5 funciones afectadas estaban entre las retiradas. |
| F-09 Funciones sin uso desplegadas | **Resuelto en la parte de IA.** Las 14 funciones IA están retiradas. Las 2 de Stripe ya respondían 410. Siguen existiendo como endpoints 410 (ver R-1). |
| F-03 Abuso de prueba y coste IA | **Reducido.** Desaparecen las 13 funciones IA heredadas sin `max_tokens`. Sigue pendiente: `signup-instant` con `email_confirm: true` y límite por IP basado en `x-forwarded-for`, `start_trial()` con 7 días Premium, y la falta de un tope global de coste. Solo quedan dos funciones con IA (`weekly-content` y `business-improvement`), ambas con límites propios. |
| Resto (F-02, F-04 a F-07, F-10 a F-31) | Sin cambios. |

## 8. Riesgos residuales

- **R-1 · Endpoints 410 visibles.** Las 14 URLs siguen respondiendo, aunque solo con 410.
  - Riesgo: nulo en coste y SSRF. Como mucho, dejan ver que existieron.
  - Si se quiere que desaparezcan del todo, se pueden borrar más adelante con `delete_edge_function`, pero eso es menos reversible.
- **R-2 · SSRF residual en `analyze-website` (F-10).** Sigue igual:
  - La comprobación DNS falla en abierto.
  - No hay límite de tamaño de respuesta.
  - No hay timeout en robots.txt ni en el sitemap.
  - Es ahora la única función que descarga URLs del usuario.
- **R-3 · Coste IA de las funciones activas (F-03).** `weekly-content` y `business-improvement` tienen límites por usuario, pero no hay tope global. El abuso del registro y la prueba gratuita sigue abierto.
- **R-4 · Uso previo no verificable.** No es posible saber desde aquí si alguien llamó a las funciones retiradas antes de A2.1.
  - Recomendación: revisar el uso de la cuenta de OpenAI y los registros de las funciones en Supabase durante las últimas semanas.
- **R-5 · Clave de OpenAI.** Sigue configurada porque la usan las dos funciones activas. No se ha rotado. Conviene rotarla si R-4 muestra tráfico sospechoso.
- **R-6 · `gbp-sync` valida el cuerpo antes que la sesión** (400 en lugar de 401). Ya era así antes de A2.1. No hace llamadas externas sin sesión.
  - Severidad: P3 informativa. Es nueva y no se corrige aquí.
- **R-7 · Pruebas funcionales completas pendientes.** No se ha ejecutado un flujo real con usuario (registro, prueba gratuita, generación IA, pago). Siguen pendientes las pruebas manuales M1–M15 de A1.

## 9. Entrega

- `localseohub-fixA21.zip`: código completo tras A2.1. Excluye `node_modules`, `dist`, `.env`, los ZIP anteriores y las carpetas de informes.
- `localseohub-fixA21-informe.zip`: este informe.

**Siguiente paso:** detenerse y esperar la auditoría de A2.1. No se inicia FIX A2.2.
