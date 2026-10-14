# A2.4.2-0 — Generalized AI Usage Ledger & Pre-Tool Security Foundation

**Veredicto: COMPLETADO** (pendiente de auditoría y autorización expresa antes de A2.4.2).
Migración aplicada: `supabase/migrations/20261014194508_a2420_generalized_ai_usage_ledger.sql`.

---

## A. Estado previo del ledger (inspeccionado en la BD real, no asumido)

| Objeto | Estado previo |
|---|---|
| `ai_usage_monthly` | PK `(user_id, period_start)`; `weekly_content_used int NOT NULL DEFAULT 0`, `business_improvement_used int NOT NULL DEFAULT 0`, `created_at`. CHECK `ai_usage_monthly_non_negative` (ambos >= 0), CHECK `period_first` (día 1), FK `auth.users ON DELETE CASCADE`. |
| `ai_usage_reservations` | `id uuid PK` (token generado en servidor), `user_id`, `function`, `period_start`, `status` (default `reserved`), `created_at`, `settled_at`. CHECK `function IN ('weekly-content','business-improvement')`; CHECK `status IN (reserved, completed, consumed, released, expired)`. |
| `reserve_ai_usage(p_reservation_id, p_user_id, p_function)` | Constantes `c_per_fn = 40`, `c_global = 80`. Rechaza nombres fuera de los 2. `INSERT … ON CONFLICT DO NOTHING` de la fila mensual, `SELECT … FOR UPDATE`, expira reservas > 10 min, comprueba `fn_limit` y `global_limit`, `INSERT … ON CONFLICT (id) DO NOTHING` + `IF NOT FOUND → invalid`, incrementa columna. Devuelve `{status, fn_used, global_used}`. |
| `settle_ai_usage(p_reservation_id, p_user_id, p_outcome)` | Outcomes `completed/consumed/released`. Busca por `id AND user_id`. Orden de bloqueo: fila mensual → reserva. Solo transiciona desde `reserved` (o `expired` salvo release). Release decrementa con `GREATEST(x-1,0)` en el mes de la reserva. |
| `reconcile_ai_usage()` | Expira reservas > 10 min y eleva contadores con `GREATEST(m.x, ledger)` (nunca baja). |
| Llamadores | `reserve_weekly_content` → `reserve_ai_usage(v_token, p_user_id, 'weekly-content')`; `reserve_business_improvement` → `reserve_ai_usage(v_token, p_user_id, 'business-improvement')`. Nombre y token fijados en SQL; las Edge Functions no envían el nombre del ledger. |
| Grants | Las 9 RPC de reserva/settle/complete/release: `SECURITY DEFINER`, `search_path=public`, EXECUTE solo `service_role`. |
| Datos | 0 filas en `ai_usage_monthly`, 0 en `ai_usage_reservations` (antes y después). 10 usuarios en `auth.users`. |

## B. Problema detectado
1. El CHECK de `function` y la guarda de `reserve_ai_usage` solo admitían 2 nombres: cualquier herramienta nueva habría requerido un sistema paralelo o una modificación ad hoc.
2. **Riesgo latente**: `reserve_ai_usage` y `settle_ai_usage` usaban `CASE … ELSE business_improvement_used`; con solo ampliar la lista, cualquier función nueva se habría contabilizado (y liberado) en el contador de business-improvement.
3. El límite global solo sumaba 2 columnas: añadir columnas sin incluirlas habría permitido gasto fuera del tope de 80.
4. `reconcile_ai_usage` solo reconciliaba 2 funciones.

## C. Diseño elegido
**Opción A — columnas por función en la misma tabla**, con:
- 3 columnas nuevas `seo_generator_used`, `business_advisor_used`, `voice_simulator_used` (`DEFAULT 0`, CHECK >= 0).
- CHECK de `function` ampliado a 5 nombres.
- Tope por función resuelto en un único `CASE` dentro de `reserve_ai_usage`: 40 / 40 / **0 / 0 / 0**. Tope 0 ⇒ respuesta `disabled` antes de tocar ninguna fila.
- Incremento/decremento explícito por columna (`+ (p_function = '…')::int`), sin rama `ELSE`.
- Global = suma de las 5 columnas, constante `c_global = 80`.

## D. Razón
- **Compatibilidad**: misma tabla, mismas firmas, mismo JSON, mismos grants; `reserve_weekly_content` / `reserve_business_improvement` no se tocan.
- **Atomicidad**: se mantiene el mismo modelo de bloqueo probado en A2.3.1.
- **Rollback trivial**: basta con re-ejecutar las 3 funciones anteriores.
- La opción B (tabla normalizada `(user_id, period, function, used)`) obligaría a migrar contadores vivos, cambiar el lock (varias filas por mes en lugar de una) y reescribir los RPC de weekly/business: más riesgo sin beneficio a 5 funciones.

## E. Migraciones creadas
`20261014194508_a2420_generalized_ai_usage_ledger.sql` (única). Aditiva, idempotente (`ADD COLUMN IF NOT EXISTS`, CHECK condicional, `DROP CONSTRAINT IF EXISTS` + re-creación del CHECK ampliado).

## F. RPC modificadas
`reserve_ai_usage`, `settle_ai_usage`, `reconcile_ai_usage` (CREATE OR REPLACE, firmas idénticas). Nuevo valor de respuesta posible en `reserve_ai_usage`: `{status:'disabled'}` — inalcanzable desde weekly-content/business-improvement porque usan nombres con tope 40. No modificadas: `reserve_weekly_content`, `reserve_business_improvement`, `complete_*`, `release_*`, `start_trial`, `billing_state_for`, `authorize_premium_request`.

## G. Tablas modificadas
- `ai_usage_monthly`: +3 columnas, +1 CHECK (`ai_usage_monthly_future_non_negative`). CHECK original intacto.
- `ai_usage_reservations`: CHECK `ai_usage_reservations_function_check` ampliado (estrictamente más amplio; las filas existentes siguen siendo válidas).

## H. Política de límites resultante
| Función | Tope mensual | Estado |
|---|---|---|
| weekly-content | 40 | activo (sin cambios) |
| business-improvement | 40 (+ legacy 40 en `business_improvement_usage`, sin cambios) | activo (sin cambios) |
| seo-generator | 0 | reconocido, deshabilitado |
| business-advisor | 0 | reconocido, deshabilitado |
| voice-simulator | 0 | reconocido, deshabilitado |
| **Global por usuario** | **80** (suma de las 5) | sin cambios |

Habilitar una herramienta futura exigirá una migración que asigne su tope **dentro** del global de 80 (p. ej., reduciendo otros o fijando un sub-tope). Añadir nombres nunca aumenta el máximo: el global es una constante única y la suma de topes actual es exactamente 80 (test 12).

## I. Compatibilidad weekly-content
Mismo nombre, mismo tope 40, misma columna, mismo token, mismos estados y códigos HTTP (la Edge Function y su handler no se han modificado ni redesplegado). Verificado en BD real: 40 reservas → `reserved:40/40`; la 41ª → `fn_limit`.

## J. Compatibilidad business-improvement
Igual: tope 40, columna propia, legacy 40 intacto. Verificado en BD real: 40 reservas → `reserved:40/80`; la 41ª → `fn_limit`.

## K. Preparación para seo-generator, business-advisor, voice-simulator
El ledger reconoce los nombres (CHECK + columnas + reconcile), pero `reserve_ai_usage` responde `disabled` sin crear fila mensual ni reserva (verificado: `rows_after_rejects=0/0`). No existen Edge Functions con esos nombres ni RPC wrapper que los invoque; no hay llamadas desde el frontend. Para activar cada uno: migración con su tope + RPC wrapper con nombre fijado en SQL + Edge Function con `requirePremium`.

## L. Seguridad multiusuario
- Los 3 RPC del ledger: EXECUTE solo `service_role` (verificado tras la migración). anon/authenticated no pueden llamarlos.
- El nombre de función lo fija el SQL del wrapper, nunca el cliente → no es posible falsificar `function` para saltar límites.
- `settle_ai_usage` busca `id AND user_id`: verificado en BD real que usuario B no puede liberar la reserva de A (`B_release_A=false`) y que el uso de A (80) no afecta al de B (`B_reserve=reserved:1`).
- Mayúsculas/nombres legacy (`WEEKLY-CONTENT`, `generate-seo`) → `invalid`. Inserción directa con `function='evil'` → bloqueada por CHECK.

## M. Atomicidad / concurrencia
- `SELECT … FOR UPDATE` de la fila mensual antes de leer contadores, comprobar topes e insertar → dos reservas del mismo usuario se serializan. Settle usa el mismo orden de bloqueo (mes → reserva), evitando deadlocks.
- **Honestidad**: la concurrencia real (dos sesiones en paralelo) **NO se ha ejecutado**. La herramienta SQL disponible solo ejecuta una sesión y la BD no tiene `dblink`/`pg_net`. Lo verificado en BD real ha sido secuencial; lo de concurrencia está cubierto por tests estáticos (6, 7) y por diseño.
- **Instrucción E2E** (staging, usuario de prueba con premium): lanzar 50 peticiones simultáneas a `weekly-content` (p. ej., `xargs -P 50 curl …` con un JWT válido y 50 `weekStart` distintos) partiendo de `weekly_content_used = 0`; resultado esperado: `weekly_content_used ≤ 40`, `count(reservations WHERE status <> 'released') = weekly_content_used`, ninguna respuesta 5xx por deadlock. Hacer lo mismo cruzando weekly + business para verificar el global ≤ 80.

## N. Idempotencia
`INSERT … ON CONFLICT (id) DO NOTHING` + `IF NOT FOUND → invalid` antes de incrementar. Verificado en BD real: reutilizar un id ya usado → `invalid` sin incrementar. Doble release → `false`; release tras complete → `false`; outcome desconocido → `false`.

## O. Resultado P1-02 (signup abuse) — solo auditoría, NO aplicado
**Cadena**: `signup-instant` crea usuarios con `email_confirm: true` → `start_trial` exige `email_confirmed_at`, que queda siempre satisfecho → trial de 7 días por cuenta → 80 unidades IA/mes por cuenta.
**Barreras actuales antes del consumo IA**: límite por IP 10/h (IP leída de `x-forwarded-for`, el propio código lo marca "best effort", potencialmente falsificable), por email 5/h, cortafuegos global 50 cuentas creadas/h (solo cuentas etiquetadas por el servidor), `requirePremium` + `authorize_premium_request` 30/h por usuario, topes del ledger 40/40/80 por usuario/mes, máximo 5 negocios por usuario. No hay captcha.
**Riesgo de coste**: el límite global acota a ~50 trials/h ≈ 1.200/día; cada uno puede consumir hasta 80 llamadas `gpt-4o-mini` (≈ 96.000 llamadas/día en el peor caso). Los 30/h por usuario frenan la velocidad, no el total. Hoy el impacto está acotado por el coste bajo del modelo; **cada herramienta nueva que reciba tope dentro de los 80 no aumenta este máximo**, pero sí lo haría si se elevara el global.
**Corrección mínima propuesta (no aplicada, sin SMTP)**: (1) reducir `GLOBAL_CREATED_LIMIT` de 50/h a ~10/h y añadir un tope diario (p. ej. 60/día) — una línea, no rompe el registro normal; (2) sustituir `x-forwarded-for` por la cabecera de IP del proveedor si se confirma que la plataforma la sobrescribe; (3) a medio plazo, Cloudflare Turnstile verificado en servidor. Ninguna se ha aplicado.

## P. Tests
- Total: **655 / 655 passed, 0 failed** (29 ficheros). 638 previos + 17 nuevos (`src/features/billing/__tests__/a2420Ledger.test.ts`), uno por cada requisito 1–17.
- Comprobaciones adicionales ejecutadas en la BD real en un bloque revertido (RAISE final; verificado 0 filas después): nombres desconocidos/deshabilitados, topes 40/40, global 80 incluyendo columnas nuevas, idempotencia, aislamiento A/B, settle/release/doble release, clamp a 0, CHECK no-negativo, reconcile (`adjusted:1`, restaura 40), CHECK de función.

## Q. Build
`npm run build` OK.

## R. TypeScript
20 errores — **todos PRE-EXISTING** (App.tsx, landings de `src/components/*`, AdminDashboard legacy). **NEW: 0.** Nota: los ficheros de referencia de A2.4.1 en `/tmp` ya no existían; la comparación se hace por recuento (20 = 20) y por ficheros afectados (ninguno tocado en esta fase).

## S. ESLint
30 problemas (23 errores, 7 warnings) — **todos PRE-EXISTING** (mismos 13 ficheros, ninguno tocado en esta fase). **NEW: 0.**

## T. Supabase / security warnings
Advisor de seguridad tras la migración: 8 avisos, **todos preexistentes**, ninguno sobre los objetos modificados: RLS sin políticas (intencional, solo service_role) en `edge_rate_limits` y `stripe_customer_repairs`; `get_funnel_stats` con search_path mutable; `billing_status`, `current_user_has_premium` y `start_trial` ejecutables por authenticated (intencional); leaked password protection desactivado. **NEW: 0.**

## U. Regresiones
Ninguna detectada. Edge Functions no modificadas ni redesplegadas; `/herramientas` sin cambios; signup sin cambios.

## V. Riesgos pendientes
1. P1-02 abierto (ver O).
2. Concurrencia real pendiente de E2E (ver M).
3. Al activar cada herramienta habrá que decidir cómo se reparte el global de 80 (hoy 40+40 lo agotan; una herramienta nueva con tope > 0 competirá por el mismo global, que es el comportamiento deseado).
4. AUTH-RESET-001: pasos manuales pendientes (redirect URL `/reset-password` en Supabase y prueba con email real).

## W. Rollback lógico
1. Re-ejecutar los `CREATE OR REPLACE` de `reserve_ai_usage`, `settle_ai_usage` y `reconcile_ai_usage` de `20261010165247_a231_ai_reservation_ledger_and_concurrency.sql` (y sus REVOKE/GRANT).
2. Restaurar el CHECK de 2 nombres (`DROP CONSTRAINT ai_usage_reservations_function_check` + `ADD … CHECK (function IN ('weekly-content','business-improvement'))`). Seguro porque ninguna reserva puede tener un nombre nuevo (tope 0).
3. Las 3 columnas nuevas (siempre 0) y su CHECK pueden quedarse; no afectan al código anterior.
No se pierde ningún dato en ninguna dirección.

## X. Confirmaciones explícitas
- NO new AI tool was activated.
- NO retired Edge Function was reactivated.
- NO Stripe configuration was modified.
- NO Google OAuth/GBP configuration was modified.
- Existing weekly-content and business-improvement limits were not increased.

Adicionalmente: las 14 funciones retiradas siguen en 410 con `verify_jwt` sin cambios; `/herramientas` sigue mostrando "Aún no disponible" / "En preparación". **No se avanza a A2.4.2 sin autorización expresa.**
