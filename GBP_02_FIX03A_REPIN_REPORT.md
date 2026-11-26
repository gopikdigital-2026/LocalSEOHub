# LocalSEOHub.io — GBP-02-FIX03A-REPIN

## Actualización controlada de un único hash guardián

**Modo:** implementación mínima, sin despliegue
**Fecha:** 2026-11-26
**Veredicto:** **GO**, pendiente de auditoría independiente

---

## 1. Objetivo

Actualizar exclusivamente el hash congelado de `supabase/functions/gbp-recover-attempt/index.ts` en la sección "A3.5.1 · P. GBP regression: frozen files" del guardián `src/features/meta-connection/__tests__/a351MetaConnection.test.ts`. La finalidad es reflejar la corrección H1 aprobada en GBP-02-FIX03A.

| Campo | Valor |
|---|---|
| Hash anterior | `3a0d378b6f71478b1c4c49dcb52aceced12b022ac2e10c97478b9f55e7f9b162` |
| Hash nuevo | `ba0841a1e1b7aff9e9ce27261557e9501bed46d40be1b8f081806d8da0101a21` |
| Línea del guardián | 584 |

## 2. Fase A — Pre-checks

| Comprobación | Resultado |
|---|---|
| SHA-256 real de `gbp-recover-attempt/index.ts` == hash nuevo autorizado | PASS |
| Guardián contenía el hash anterior exactamente 1 vez | PASS |
| Guardián contenía el hash nuevo 0 veces | PASS |
| Restantes 19 entradas de la sección coinciden con sus archivos | PASS (19/19) |

Evidencia: `evidence/01_phaseA_precheck.txt`.

## 3. Fase B — Reemplazo único

Se hizo un reemplazo a nivel de bytes, comprobando que había exactamente una ocurrencia. El diff (`evidence/03_guardian.diff`) contiene 1 línea eliminada y 1 línea añadida:

```diff
-    'supabase/functions/gbp-recover-attempt/index.ts': '3a0d378b6f71478b1c4c49dcb52aceced12b022ac2e10c97478b9f55e7f9b162',
+    'supabase/functions/gbp-recover-attempt/index.ts': 'ba0841a1e1b7aff9e9ce27261557e9501bed46d40be1b8f081806d8da0101a21',
```

| Archivo guardián | SHA-256 |
|---|---|
| Antes | `dd64157c96f5b3eb59336a26d2d3f37d57f13a7e2f9918c1afb7e3336a6fff78` |
| Después | `fc1e42a63c56412e8a0089112647a6fe8ee7813b9f0249660d501c6c6f5bb5c4` |

## 4. Fase C — Validación

| Verificación | Objetivo | Resultado |
|---|---|---|
| Guardián Meta (a351) | 100/100 | 100/100 |
| FIX03A H1 | 11/11 | 11/11 |
| Recuperación GBP (a341, a3422, gbp02Fix02c) | 79/79 | 79/79 |
| Compatibilidad GBP (reality-engine, 8 archivos) | 242/242 | 242/242 |
| Suite completa (101 archivos) | 3347/3347 | 3347/3347 |
| TypeScript | 20 errores históricos | 20, idéntico a la línea base FIX03A |
| ESLint | 47 errores, 10 avisos | 47 errores y 10 avisos, idéntico a la línea base FIX03A |
| Build | OK | OK |

Detalle en `GBP_02_FIX03A_REPIN_TEST_REPORT.md`.

## 5. Fase D — Integridad

- Las 20 entradas de la sección congelada GBP coinciden: **20/20**.
- El hash nuevo aparece exactamente 1 vez en el guardián y el hash anterior 0 veces.
- Se compararon 559 archivos de código (`src/`, `supabase/` y configuración) con el `project/` del ZIP independiente `localseohub-gbp02-fix03a.zip`. **Solo cambió el guardián.**
- `gbp-recover-attempt/index.ts` (`ba0841a1…`) y `handler.ts` (`8467fa46…`) no se modificaron.

Evidencia: `evidence/12_phaseD_integrity.txt`, `evidence/13_tree_hashes_after.txt`, `evidence/15_vs_fix03a_zip.txt`.

## 6. Acciones prohibidas: confirmación

| Acción | Estado |
|---|---|
| Despliegue de Edge Functions | No realizado. `gbp-recover-attempt` sigue sin desplegar |
| Modificación de `index.ts` u otras funciones GBP | No realizada |
| Migraciones / cambios en base de datos / SQL | No realizados |
| Llamadas a Google o Meta | No realizadas |
| Meta, Publicaciones, Hoy, Tu Semana, Stripe, Auth | Sin cambios |
| FIX03B o funcionalidades nuevas | No iniciados |

## 7. Notas

- **Regeneración de artefactos.** Sincronizaciones del entorno eliminaron los entregables de REPIN en dos ocasiones, aunque el cambio en el guardián siguió aplicado. Los informes, las evidencias y el ZIP se regeneraron, y todas las validaciones se volvieron a ejecutar con resultados idénticos.
- **Copia "antes" del guardián.** Se reconstruyó invirtiendo el único reemplazo. Su SHA-256 coincide con el valor original registrado (`dd64157c…`). La prueba independiente de que solo cambió el guardián es la comparación con el ZIP de FIX03A.
- **Formato de los registros.** El `.gitignore` del proyecto excluye `*.log`, así que todos los registros de esta tarea se guardan como `.txt`.

## 8. Criterios de cierre

| Criterio | Estado |
|---|---|
| Exactamente un hash actualizado | Cumplido |
| 20/20 entradas guardián correctas | Cumplido |
| Suite completa en verde | Cumplido (3347/3347) |
| Sin regresiones (tsc, eslint, build) | Cumplido |

**Veredicto: GO.** El trabajo queda detenido a la espera de auditoría independiente.
