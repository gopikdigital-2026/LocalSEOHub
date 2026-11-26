# GBP-02-FIX02D — pruebas y evidencias

Fecha: 2026-11-24. Entorno local; Supabase y Google simulados en la batería GBP. Ningún despliegue.

## Prueba permanente recuperada: 20 casos, 20 PASS

Archivo: `src/features/reality-engine/__tests__/gbp02Fix02cDependencies.test.ts`.

| Grupo | Casos | Qué comprueba |
|---|---:|---|
| Listado | 2 | biz-a / biz-b usan sólo source-a / source-b y sus ubicaciones; credenciales distintas |
| Listado ambiguo | 1 | 409 BUSINESS_SELECTION_REQUIRED; cero accesos a credenciales, llamadas Google y escrituras |
| Listado automático | 1 | un negocio resuelve automáticamente |
| Rechazo listado | 3 | foreign, nonexistent y accounts/123 → 403 sin credenciales/Google |
| Recuperación/cancelación | 2 | recover y cancel modifican source-b; source-a permanece idéntica |
| Recuperación/cancelación ambigua | 2 | ambas acciones devuelven 409 sin escrituras |
| Recuperación automática | 1 | un negocio recupera source-a |
| Rechazo cancelación | 3 | foreign, nonexistent, accounts/123 → 403 sin modificaciones |
| Callback | 2 | state-a / state-b guardan credenciales y actualizan sólo su sourceId |
| Estado OAuth desconocido | 1 | ATTEMPT_NOT_FOUND; cero credenciales, actualizaciones y fetch |
| Desconexión interfaz | 1 | ejecución del motor con biz-b produce body.businessId; enlace SourceManager comprobado por lectura |
| Desconexión compatible | 1 | omitir ID conserva body vacío y resolución automática del servidor |

No se afirma concurrencia ni uso único OAuth certificados. La ausencia de Google en recover/cancel se sustenta en el adaptador capturado cuyo fetch real lanza error y el recorrido de recuperación que no hace fetch. No se acredita un clic real en navegador: la prueba de interfaz combina ejecución del motor y comprobación del código de SourceManager.

## Compatibilidad: 168/168 PASS (6 archivos)

- a341GbpSecurity.test.ts
- a3422GbpRecovery.test.ts
- gbpListLocations.test.ts
- gbp02Fix01Verification.test.ts
- gbp02Fix02bActiveBusiness.test.ts
- gbp02Fix02cDependencies.test.ts

La suite completa incluye además las pruebas de reseñas y negocio. No hay fallo GBP funcional registrado. No se crea una certificación adicional bajo nombres F01/F02: la evidencia se refiere a los archivos reales listados y a la suite actual.

## Suite completa: no alcanza el resultado histórico

100 archivos: 93 PASS y 7 FAIL. 3172 pruebas recopiladas: 3155 PASS y 17 FAIL. Cinco archivos fallan al recopilar por ausencia de photo-exif-gps.jpg; cuatro pruebas de a37211aUploadBytes fallan por ausencia de esa imagen o photo-text-exif.png. Trece pruebas fallan exclusivamente por guardianes de hash congelado.

Guardianes: engine.ts; handler.ts/index.ts de gbp-oauth-start, gbp-disconnect, gbp-sync, gbp-recover-attempt, gbp-list-locations y gbp-reviews. No se actualiza ningún hash.

No se manipularon los totales a 3323/13. Fixtures ajenos ausentes son un bloqueo de reproducibilidad del proyecto actual, no una regresión funcional demostrada. No se modificaron esas pruebas.

## Otras comprobaciones

| Comprobación | Resultado |
|---|---|
| npm run typecheck | salida 2; 20 errores |
| npm run lint | salida 1; 47 errores, 10 warnings |
| npm run build | salida 0 |
| Grafo Edge local | salida 0; siete funciones; activeBusiness presente en seis |
| Supabase Edge packaging | NOT VERIFIED |
| Integridad producción/guardianes | sin modificaciones; única diferencia inventariada: prueba FIX02C |

## Evidencias completas y reproducción

Carpeta `auditoria-a2/gbp02-fix02d/evidence/`:
- focused.log: los 20 resultados individuales.
- gbp-compatibility.log: compatibilidad 168/168.
- full-suite.log: suite completa, errores ENOENT y guardianes.
- typecheck.log, lint.log, build.log y build-final.log: salidas completas.
- commands.json: comandos exactos y códigos de salida, sin eliminar fallos.
- edge-graph.log y edge-*.json: grafo reproducible con check-edge-graph.mjs.
- before-hashes.json, after-hashes.json, integrity.json: control de cambios.
- recovered-original.txt y test.diff: versión inicial y refuerzo de dos aserciones, manteniendo veinte casos.

El ZIP incluye un manifiesto SHA-256 de todas las entradas, excepto el propio manifiesto, cuya autohuella sería circular. CRC y hashes se verifican después de generarlo. No se incluyen secretos de entorno ni archivos ZIP previos.

**Estado: pruebas FIX02C disponibles y verificadas; validación global bloqueada. Detenido para auditoría independiente.**
