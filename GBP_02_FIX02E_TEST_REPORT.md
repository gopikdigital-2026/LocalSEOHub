# LocalSEOHub.io — GBP-02-FIX02E · Informe de pruebas

Fecha: 2026-11-25 · Entorno: local (Vitest, Node). Sin red externa, sin despliegue y sin llamadas a Google.

## 1. Fixtures validados

| Archivo | Tamaño | SHA-256 | Coincide con el original archivado |
|---|---|---|---|
| photo-exif-gps.jpg | 48 612 | 52547377f0dced0baa51780d2720f4ec4dddcef11c1cc1371a8993c0cbb60471 | Sí, en 35 de 35 ZIP |
| photo-text-exif.png | 15 107 | c137d926cd83ea52302587480b5c80966b9633d93153055aedb233df248eb120 | Sí, en 35 de 35 ZIP |

Evidencia: `evidence/provenance.json`, con 70 entradas (35 ZIP × 2 archivos).

## 2. Pruebas de publicaciones afectadas (usan los fixtures)

Comando: `npx vitest run <6 archivos> --reporter=verbose` · Registro: `evidence/publications.log`

| Archivo | Aprobadas |
|---|---|
| a37211aUploadBytes.test.ts | 10 |
| a37221ClassificationRouting.test.ts | 28 |
| a3722RelationalGrounding.test.ts | 47 |
| a3723CopyQuality.test.ts | 20 |
| a372Normalization.test.ts | 25 |
| a372ProposalsEngine.test.ts | 44 |
| **Total** | **174 / 174** (0 fallidas) |

## 3. Pruebas FIX02C (20)

Archivo `gbp02Fix02cDependencies.test.ts`, SHA-256 e3c2f3e3c3104f10e7565536272d611425c04eaa86d10f8d2e635488faf35e9f, sin cambios respecto a FIX02D. Registro: `evidence/fix02c.log`. Resultado: **20 / 20 aprobadas**.

- **Ubicaciones (7):**
  - Los negocios biz-a y biz-b quedan aislados entre sí.
  - Sin negocio seleccionado se devuelve 409, sin acceder a credenciales ni a Google.
  - Con un solo negocio, la selección es automática.
  - Un negocio ajeno, uno inexistente y el valor `accounts/123` se rechazan sin acceder a credenciales.
- **Recuperación y cancelación (8):**
  - Al recuperar y al cancelar, solo cambia el negocio B seleccionado.
  - Sin negocio seleccionado se devuelve 409, sin escrituras, tanto al recuperar como al cancelar.
  - Con un solo negocio, la selección es automática.
  - Un negocio ajeno, uno inexistente y `accounts/123` se rechazan sin modificar nada.
- **Callback OAuth (3):**
  - state-a solo escribe en su propia fuente, y state-b en la suya.
  - Un state desconocido no accede a los tokens ni llama a la red.
- **Desconexión desde la interfaz (2):**
  - Se envía el businessId del negocio seleccionado.
  - Si no se envía id, el servidor sigue resolviendo el negocio por sí mismo.

La concurrencia y el uso único del state OAuth siguen **NO certificados**, porque no hay pruebas específicas para ello.

## 4. Compatibilidad GBP (168)

Registro: `evidence/gbp-compatibility.log`

| Archivo | Pruebas |
|---|---|
| a341GbpSecurity.test.ts | 35 |
| gbp02Fix01Verification.test.ts | 36 |
| gbp02Fix02bActiveBusiness.test.ts | 33 |
| a3422GbpRecovery.test.ts | 24 |
| gbpListLocations.test.ts | 20 |
| gbp02Fix02cDependencies.test.ts | 20 |
| **Total** | **168 / 168** |

## 5. Suite completa

Comando: `npm test` · Registro: `evidence/full-suite.log` · Código de salida 1, por los guardianes.

- Archivos: **100**, de los que 99 aprueban y 1 falla.
- Pruebas ejecutadas: **3336**. **3323 aprobadas** y **13 fallidas**.
- Las 13 fallidas son todas de `a351MetaConnection.test.ts > A3.5.1 · P. GBP regression: frozen files > … is byte-identical` y corresponden a estos archivos:
  - engine.ts
  - handler.ts e index.ts de gbp-disconnect, gbp-list-locations, gbp-oauth-start, gbp-recover-attempt, gbp-reviews y gbp-sync
- Son los guardianes de integridad cuyo fallo se espera tras los cambios autorizados de F01, F02, FIX02B y FIX02C. **No se han modificado.**
- Fuera de los guardianes no hay ningún otro fallo.

Diferencia respecto a FIX02D, que dio 3155 aprobadas y 17 fallidas sobre 3172 ejecutadas:

- Vuelven a ejecutarse 164 pruebas que antes no llegaban a correr porque faltaban los archivos.
- Desaparecen los 4 fallos por archivo no encontrado (ENOENT).
- El resultado coincide exactamente con el esperado: 3323 aprobadas y 13 fallos de guardianes.

## 6. TypeScript, lint y build

| Comprobación | Comando | Resultado | Registro |
|---|---|---|---|
| TypeScript | `npm run typecheck` | 20 errores, igual que la línea base (salida 2) | evidence/typecheck.log |
| Lint | `npm run lint` | 57 problemas (47 errores y 10 avisos), igual que la línea base (salida 1) | evidence/lint.log |
| Build | `npm run build` | Correcto (salida 0) | evidence/build.log |

## 7. Integridad

`evidence/before-hashes.json` y `evidence/after-hashes.json` cubren 554 archivos: `src/`, `supabase/`, package.json, package-lock.json, tsconfig*, vite.config.ts y eslint.config.js. **Diferencias: 0.**

## 8. Entrega (ZIP)

- **Contenido de `localseohub-gbp02-fix02e.zip`:**
  - los dos informes FIX02E
  - los fixtures
  - las 20 pruebas FIX02C
  - todos los registros de `auditoria-a2/gbp02-fix02e/evidence/`
  - `FIX02E_ZIP_MANIFEST.json`, con el SHA-256 de cada entrada; el manifiesto no se incluye en su propia lista
- **Ubicación:** hay dos copias idénticas, una en la raíz del proyecto y otra en `deliverables/`.
- **Exclusiones:** `.env*`, otros `*.zip`, archivos de claves, node_modules, dist, .git, .bolt y deliverables.
- **Comprobaciones posteriores:** CRC correcto, 0 discrepancias de hash y 0 entradas prohibidas.
- **Escaneo de secretos:** 0 coincidencias y ningún secreto real.
  - Patrones buscados: claves Stripe y webhook con longitud real, clave de servicio de Supabase con valor asignado, claves privadas, y claves de API y secretos OAuth de Google.
  - Los valores ficticios cortos de las pruebas de pagos (por ejemplo `sk_test_123abc`) no son secretos.

## 9. Veredicto

La ejecución completa de Vitest queda restablecida con los fixtures originales. No se ha detectado ningún defecto funcional. Los 13 guardianes siguen pendientes de una actualización autorizada.

**Detenido para auditoría independiente.**
