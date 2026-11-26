# LocalSEOHub.io — GBP-02-FIX02E

## Recuperación controlada de fixtures de pruebas

Fecha: 2026-11-25 · Estado: **COMPLETADO — detenido para auditoría independiente**

## 1. Resumen

Los dos fixtures que faltaban en FIX02D, `photo-exif-gps.jpg` y `photo-text-exif.png`, están en su ruta original. Son **byte-idénticos a los originales archivados** en las 35 copias ZIP anteriores del proyecto que los contienen. No hizo falta escribir ningún archivo. No se usaron imágenes genéricas ni se reconstruyeron metadatos.

La suite completa vuelve a dar el resultado esperado: **3336 pruebas ejecutadas, 3323 aprobadas y 13 fallidas**. Las 13 fallidas son los guardianes de integridad pendientes de una actualización autorizada.

Nota de trazabilidad: una restauración del estado del proyecto, ajena al agente, eliminó una primera generación de esta entrega. Todas las validaciones se han vuelto a ejecutar y los registros incluidos corresponden a esa segunda ejecución. Los resultados coinciden con la primera.

## 2. Fase 1 — Localización

| Fuente | Resultado |
|---|---|
| Version History de Bolt | El agente no tiene acceso. Los archivos volvieron al árbol de trabajo por una restauración del estado del proyecto que no hizo el agente. Desde aquí no se puede certificar qué versión exacta se restauró. |
| Repositorio GitHub vinculado | No disponible: el directorio no es un repositorio git y no tiene ningún remoto configurado. |
| Copias ZIP anteriores | **Disponibles.** Hay 35 ZIP, en la raíz y en `deliverables/`, que contienen los dos archivos en `src/features/publications/__tests__/fixtures/`. En las 35 copias, cada archivo tiene el mismo hash. |

### Fixtures

| Archivo | Ruta | Tamaño | SHA-256 |
|---|---|---|---|
| photo-exif-gps.jpg | src/features/publications/__tests__/fixtures/ | 48 612 bytes | 52547377f0dced0baa51780d2720f4ec4dddcef11c1cc1371a8993c0cbb60471 |
| photo-text-exif.png | src/features/publications/__tests__/fixtures/ | 15 107 bytes | c137d926cd83ea52302587480b5c80966b9633d93153055aedb233df248eb120 |

Procedencia de referencia: `deliverables/localseohub-a3743-gateB4fix01-verification.zip` y otros 34 ZIP. En todos, el hash coincide con el del archivo actual. El detalle está en `auditoria-a2/gbp02-fix02e/evidence/provenance.json`: 70 entradas, de 35 ZIP con 2 archivos cada uno.

### Verificación de contenido

- **photo-exif-gps.jpg**
  - Empieza con la firma JPEG (FFD8).
  - Tiene un segmento APP1 `Exif` y el puntero GPS IFD (etiqueta 0x8825).
  - Es lo que esperan las pruebas de eliminación de metadatos y GPS.
- **photo-text-exif.png**
  - Tiene firma PNG válida.
  - Contiene los bloques IHDR, cHRM, bKGD, **eXIf**, **tEXt**, **iTXt**, tIME, un bloque privado `prVt`, IDAT e IEND.
  - Lleva 25 bytes después de IEND. Ese rasgo ya está en el original archivado, que no se ha tocado, y encaja con las pruebas de normalización, que deben descartar los metadatos y los datos residuales.

## 3. Fase 2 — Recuperación

No hizo falta escribir nada. Los archivos ya estaban en su ruta original y su hash coincide con el del original archivado. No se restauró ninguna versión completa del proyecto. No se modificó ningún test.

## 4. Fase 3 — Validación (resumen)

| Comprobación | Resultado |
|---|---|
| Pruebas de publicaciones que usan los fixtures (6 archivos) | 174 / 174 aprobadas |
| Pruebas FIX02C | 20 / 20 aprobadas |
| Compatibilidad GBP (6 archivos) | 168 / 168 aprobadas |
| Suite completa | 100 archivos: 99 aprobados y 1 fallido · **3336 pruebas: 3323 aprobadas y 13 fallidas** |
| Fallos | Los 13 son los guardianes `a351MetaConnection.test.ts > GBP regression: frozen files`, los mismos que en FIX02C y FIX02D. No hay ningún otro fallo. |
| TypeScript | 20 errores, igual que en la línea base. No hay errores nuevos. |
| Lint | 57 problemas (47 errores y 10 avisos), igual que en la línea base |
| Build | Correcto |
| Integridad | Los 554 archivos de `src/`, `supabase/` y la configuración tienen el mismo hash antes y después: 0 cambios |

El detalle está en `GBP_02_FIX02E_TEST_REPORT.md`.

## 5. Cumplimiento de prohibiciones

- Lógica de producción: sin cambios, verificado por hash.
- Tests y guardianes: sin cambios. FIX02C sigue en e3c2f3e3…5e9f y `a351MetaConnection.test.ts` en 07c224a8…7d81.
- Migraciones, índices y RLS: sin cambios. No se ejecutó SQL.
- Meta, Google, Stripe, Hoy y Tu Semana: sin cambios.
- No se ha desplegado ni publicado nada. No se ha hecho ninguna llamada real a Google.
- FIX03 no se ha iniciado.

## 6. Observaciones para la auditoría

1. Los archivos no volvieron al proyecto por acción del agente, y el agente no puede ver el historial de versiones. La garantía de que son los originales se basa en que su hash coincide con el de 35 copias archivadas independientes.
2. Los 13 guardianes siguen fallando a propósito. Para que pasen hace falta una actualización autorizada de sus hashes, que queda fuera de este alcance.
3. El empaquetado en Supabase Edge sigue **NO VERIFICADO**, porque no se ha desplegado. FIX02E no cambia eso.

## 7. Ubicación de los entregables

- `GBP_02_FIX02E_REPORT.md` y `GBP_02_FIX02E_TEST_REPORT.md` están en la raíz del proyecto y también dentro del ZIP.
- `localseohub-gbp02-fix02e.zip` está en la raíz del proyecto y en `deliverables/`; las dos copias son idénticas.
- Un ZIP no puede contenerse a sí mismo. Su hash queda registrado en `auditoria-a2/gbp02-fix02e/delivery-checks.json`.

**Fin. Detenido para auditoría independiente.**
