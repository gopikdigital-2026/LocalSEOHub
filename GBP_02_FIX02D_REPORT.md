# LocalSEOHub.io — GBP-02-FIX02D

Fecha de comprobación: 2026-11-24.
Objeto: recuperación de pruebas permanentes y cierre de evidencias FIX02C; sin nuevas funcionalidades.

## Veredicto

**Pruebas permanentes FIX02C: recuperadas y verificadas (20/20). Entrega de evidencias: completada. NO-GO para congelación/despliegue.** La suite completa no alcanza el resultado histórico esperado por imágenes de prueba ausentes, además de los guardianes pendientes. Empaquetado oficial Supabase Edge **NOT VERIFIED**. No se certifican concurrencia ni uso único OAuth.

## Paso 1 — recuperación sin restaurar el proyecto

Al iniciar FIX02D, `src/features/reality-engine/__tests__/gbp02Fix02cDependencies.test.ts` ya existe en el árbol actual. SHA-256 inicial:

`e226db8d159422b7478460e3f4269cc6832418e3cad9dbfe1fc6c22b6305e70f`

Coincide exactamente con el hash registrado en el cierre original FIX02C de la conversación. No fue necesario reconstruir las 20 pruebas ni recuperar el proyecto completo. No se tiene acceso directo al catálogo de Version History: no se afirma haberlo consultado ni restaurado. Se consultó la documentación oficial de restauración únicamente para determinar esa limitación.

Fuente: https://support.bolt.new/managing-projects/rollback-backup#restore-using-your-chat-history

El informe reconstruido FIX02C anterior mencionaba una prueba ausente; esa limitación queda superada por el archivo disponible y los resultados actuales de FIX02D. Los informes y ZIP anteriores se preservan, no se reescribe su evidencia histórica.

## Cambio autorizado: sólo aserciones de pruebas

Se conservan los mismos 20 casos. Se refuerzan dos comprobaciones dentro del archivo recuperado:
- Ambigüedad en listado: además de no acceder a credenciales ni Google, comprobar explícitamente cero escrituras del adaptador.
- Estado OAuth desconocido: además de no guardar credenciales ni actualizar fuente, comprobar explícitamente cero llamadas fetch.

SHA-256 final:

`e3c2f3e3c3104f10e7565536272d611425c04eaa86d10f8d2e635488faf35e9f`

Original reproducido y verificado por su hash en `auditoria-a2/gbp02-fix02d/evidence/recovered-original.txt`; diferencias en `test.diff`. No se cambió el código de producción para conseguir resultados favorables.

## Paso 2 — alcance real de la validación

Las pruebas ejecutan handlers reales y extraen las dependencias de los adaptadores `index.ts` mediante esbuild y node:vm, con cliente Supabase simulado y dos negocios/fuentes distintos. No se usa Google real, ni la base de datos de producción.

Validado: selección inequívoca; listado por biz-a/biz-b con source-a/source-b; negocio único automático; rechazo 403 de negocio ajeno/inexistente/mal formado; 409 sin selección con varios negocios; ausencia de credenciales/Google/escrituras en listado ambiguo; recuperar/cancelar sólo la tentativa elegida; callback por estado exacto y negocio propietario; propagación businessId desde el motor de desconexión.

Desconexión de interfaz: se ejecuta `disconnectSource` y se comprueba la invocación de `gbp-disconnect` con businessId; además se comprueba el enlace de SourceManager por lectura del archivo. No se monta la interfaz en un navegador ni se declara E2E visual.

No se detectó un defecto funcional GBP en las 20 pruebas ni en la batería de compatibilidad. No se extrapola a concurrencia, uso único OAuth, una base real multinegocio o integración desplegada.

## Paso 3 — resultados actuales

| Comprobación | Resultado |
|---|---|
| FIX02C permanente | 20/20 PASS |
| Compatibilidad GBP (6 archivos, F01/F02/FIX02B y pruebas previas) | 168/168 PASS |
| Suite completa | 3155 PASS, 17 FAIL; 5 archivos no recopilan pruebas por fixtures ausentes; 93 archivos PASS, 7 FAIL, 100 total |
| TypeScript | FAIL: 20 errores |
| Lint | FAIL: 47 errores y 10 advertencias |
| Build | PASS |
| Integridad de producción y guardianes | PASS: sin cambios respecto al inicio FIX02D |
| Grafo local Edge (7 funciones) | PASS |
| Empaquetado oficial Supabase Edge | NOT VERIFIED |

### Divergencia respecto al esperado 3323/13

13 fallos de guardianes se mantienen intactos en `a351MetaConnection.test.ts`. Los 4 fallos adicionales de pruebas y los 5 fallos de recopilación son ENOENT de imágenes de publicaciones:
- `src/features/publications/__tests__/fixtures/photo-exif-gps.jpg`
- `src/features/publications/__tests__/fixtures/photo-text-exif.png`

No son defectos funcionales demostrados del recorrido GBP: las pruebas no llegan a ejecutarse con esas imágenes. No se restauraron ni inventaron fixtures de módulos ajenos; bloqueo documentado para una recuperación exclusivamente de archivos con autorización separada. No se suprimió ningún test ni se redujo la suite para presentar un total verde.

TypeScript y lint coinciden en totales con los resultados previos de la conversación, pero no se certifica identidad detallada de cada diagnóstico anterior. El archivo de pruebas FIX02C no aparece en los diagnósticos actuales de TS/lint.

## Integridad y restricciones

Se inventariaron 553 archivos de src, supabase y configuración principal antes de trabajar. La única diferencia en ese inventario es el archivo de pruebas autorizado. Evidencias: before-hashes.json, after-hashes.json, integrity.json.

No se modificaron producción, migraciones, índices, RLS, guardianes, FB/IG, Stripe, Hoy, Tu Semana ni configuración de producción. No se desplegó; no hubo llamadas reales Google ni escrituras de base de datos; no se inició FIX03.

La contradicción del índice único por usuario identificada en FIX02C sigue fuera de alcance. No se volvió a consultar ni alterar el modelo real en FIX02D.

## Empaquetado reproducible

Script `auditoria-a2/gbp02-fix02d/check-edge-graph.mjs`, ejecutado desde la raíz. Esbuild agrupa gbp-list-locations, gbp-recover-attempt, gbp-oauth-start, gbp-sync, gbp-disconnect, gbp-reviews y gbp-oauth-callback, sin escritura de bundles; npm/jsr/https externos. Las primeras seis incluyen activeBusiness.ts en el grafo. Log y metafiles disponibles.

Esto prueba resolución de imports locales, no instalación de imports externos, runtime Deno, autenticación desplegada o empaquetador Supabase. **NOT VERIFIED** para empaquetado oficial.

## Entrega

`deliverables/localseohub-gbp02-fix02d.zip`: proyecto actual, ambos informes FIX02D, prueba permanente, registros completos, diferencias, script de grafo local y manifiesto SHA-256. Se excluyen archivos de entorno, ZIP anteriores, node_modules, dist, .git y .bolt. La verificación de archivo comprueba CRC, entradas y hashes; búsqueda de patrones de credenciales, sin hallazgos.

Funciones pendientes según FIX02B/FIX02C, sin desplegar por prohibición: gbp-oauth-start, gbp-sync, gbp-disconnect, gbp-reviews, gbp-list-locations, gbp-recover-attempt, con activeBusiness.ts.

**Detenido para auditoría independiente. No se autoriza congelación ni despliegue.**
