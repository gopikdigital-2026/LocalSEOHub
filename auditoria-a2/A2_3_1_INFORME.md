# LocalSEOHub — FIX A2.3.1: concurrencia y contabilización de IA

**Punto de partida:** FIX A2.3 (521 pruebas).
**Resultado:** 544 pruebas (521 + 23 nuevas), todas en verde. TypeScript, ESLint, build y asesores sin regresiones.
**Estado:** entregado. A2.4 no iniciado; queda a la espera de aprobación expresa.

---

## 0. Resumen ejecutivo

| Área | Antes (A2.3) | Ahora (A2.3.1) |
|---|---|---|
| Reservas de IA | `release_ai_usage(user, function)` descontaba un contador anónimo del mes en curso | Libro de reservas (`ai_usage_reservations`) con id único; `settle_ai_usage(id, user, outcome)` liquida una sola vez y sobre el mes original |
| Fallo del proveedor | Siempre liberaba | Libera solo si el proveedor no devolvió nada facturable; si hubo respuesta (tokens gastados) queda `consumed` |
| Máximo 5 negocios | `count(*)` sin serializar | Bloqueo transaccional por usuario (`pg_advisory_xact_lock`) antes de contar |
| Registro: límite global | 50 intentos/hora, consumido antes que IP y email → DoS trivial | Tope de 50 **cuentas creadas**/hora por `signup-instant`; IP y email se comprueban antes |
| Registro: cuentas nuevas | **Regresión A2.3:** cuentas sin confirmar que no podían iniciar sesión | Corregido |
| `start_trial` / validación de mejoras | **Regresiones A2.3** (ver §1) | Corregidas |

## 1. Regresiones de A2.3 detectadas y corregidas

Al revisar A2.3 en profundidad aparecieron cuatro defectos introducidos por A2.3. Se declaran expresamente:

1. **Registro roto (crítico).** A2.3 quitó `email_confirm: true` de `admin.createUser` creyendo que así se respetaría la opción "Confirm email" del proyecto. No es así: la API de administración ignora `mailer_autoconfirm` (solo confirma si se pasa `email_confirm`) y el inicio de sesión con contraseña rechaza siempre los correos no confirmados (código fuente de Supabase Auth: `admin.go` y `token.go`). Cada cuenta nueva habría quedado inutilizable en el `signInWithPassword` que la web hace justo después del registro. **Usuarios afectados: 0** (no hubo altas desde el despliegue; 10 usuarios, 0 sin confirmar). Corrección: se restaura `email_confirm: true`, que equivale exactamente al comportamiento con autoconfirmación activa. La verificación obligatoria sigue sin activarse, tal como se pidió.
2. **`start_trial` leía una clave inexistente.** `billing_state_for` devuelve `state`; la versión A2.3 tenía un error de clave que impedía el flujo normal. Restaurada la lógica original y añadida la comprobación de correo. Si no está verificado, devuelve el estado real con `trial_created:false` y `reason:'email_not_verified'`. El cliente (`repository.startTrial`) ahora lee `reason` y usa el estado real.
3. **`reserve_business_improvement` perdió validaciones de fix0721** (rule_kind, key_part, acción cerrada, 16 borradores de servicio, `edited`, etc.). Se restauró el cuerpo exacto de fix0721 y la reserva de IA se añadió al final.
4. **Trigger de 5 negocios con condición de carrera**, además de un comentario que afirmaba falsamente que `x-forwarded-for` no es falsificable. Ambos corregidos (§3 y §4).

## 2. Reservas de IA identificadas e idempotentes

### Diseño

- **Tabla `ai_usage_reservations`**: `id` (uuid, es el mismo token de reserva del borrador que emite el servidor), `user_id`, `function`, `period_start` (día 1 del mes UTC en que se reservó), `status` (`reserved | completed | consumed | released | expired`), `created_at`, `settled_at`. RLS: el usuario solo puede leer sus filas; insertar, modificar y borrar están denegados al cliente.
- **`reserve_ai_usage(id, user, function)`**:
  1. bloquea la fila mensual (`FOR UPDATE`);
  2. caduca las reservas abandonadas de ese usuario (> 10 min);
  3. comprueba 40 por función y 80 en total;
  4. inserta el registro (`ON CONFLICT (id) DO NOTHING`: un id repetido devuelve `invalid`);
  5. incrementa el contador.
- **`settle_ai_usage(id, user, outcome)`**:
  - Primero bloquea la fila mensual y después la reserva, en el mismo orden que `reserve_ai_usage`, para que no haya interbloqueos.
  - Solo acepta transiciones desde `reserved`, o desde `expired` con un resultado distinto de `released`.
  - Solo `released` descuenta, y lo hace en el `period_start` de la propia reserva.
  - Devuelve `false` si se repite la operación, si el usuario no es el titular o si la reserva no existe.
- **`reconcile_ai_usage()`**: caduca las reservas abandonadas y **sube** los contadores al recuento del libro si alguno quedó por debajo. Nunca los baja. Solo puede ejecutarlo service_role.
- **Integración:** `reserve_weekly_content` y `reserve_business_improvement` reservan la unidad de IA **solo después** de superar todas las comprobaciones del borrador, justo antes de marcarlo como «en preparación». Por eso los rechazos (`stale`, `busy`, `attempts`, `edited`, `closed`…) ya no necesitan liberar nada. Si el límite heredado de 40/mes de mejoras rechaza la petición, la unidad recién reservada se libera dentro de la misma transacción.
- El cliente no puede enviar ids, contadores ni estados: todas estas funciones son exclusivas de service_role y los ids los genera el servidor.

### Política de liquidación en los handlers

| Situación | Resultado | Motivo |
|---|---|---|
| Generado y guardado | `completed` | — |
| Proveedor caído / timeout / error, sin ninguna respuesta | `released` | Sin consumo facturable; no se bloquea al usuario por fallos ajenos |
| El proveedor respondió pero la salida se rechazó (inventos, longitud) | `consumed` | Se gastaron tokens |
| Generado pero falló el guardado | `consumed` | Se gastaron tokens |
| La función se cae a mitad | queda `reserved` → `expired` a los 10 min, **sigue contando** | Política conservadora: no se puede saber si hubo gasto |

Los límites mensuales devuelven un código nuevo, `monthly_limit`, con el mensaje «Has alcanzado el límite de uso de esta función». Así no se confunde con «Ya has usado las 3 versiones de esta semana».

### Verificación real en base de datos (bloque transaccional revertido, sin datos persistidos)

```
T1 reserve=reserved | release1=true | release2=false | counter=0
T2 complete=true | release_after_complete=false | complete_again=false | counter=1
X  other_user_settle=false | reuse_id=invalid
T4 release_prev=true | prev_counter=0 | cur_counter=1
T5 status=expired | release_expired=false | complete_expired=true | bi_counter=2
T8 wc_after_60=fn_limit fn_used=40 | bi_after_60=fn_limit global=80 | ledger_counted=80 | reconcile_adjusted=0
W  capped_reserve=fn_limit | attempts_after_cap=0 | other_user=not_found
BI bad_key=invalid | kind_mismatch=invalid | closed=closed | capped=fn_limit
BI reserved=reserved ledger_match=1 | legacy40=global | ai_counter_after_legacy_refusal=0
TR unverified state=TRIAL_NOT_STARTED created=false reason=email_not_verified | rows=0
TR verified state=TRIAL_ACTIVE created=true | again created=false
BZ second_real=rejected_unique | sixth=rejected | scratch_count=5 | advisory_xact_locks_held=1
```

## 3. Máximo de cinco negocios

- El trigger toma `pg_advisory_xact_lock(hashtextextended('businesses_per_user:'||user_id, 0))` antes de contar.
- El recuento se hace con una instantánea nueva tras obtener el bloqueo, así que la segunda inserción concurrente espera a que termine la primera y ve su fila.
- Rechaza niveles de aislamiento distintos de READ COMMITTED, donde esa garantía no se cumpliría.
- No se modifica ni se borra ningún negocio.
- **Hallazgo:** la tabla `businesses` ya tiene `UNIQUE(user_id)` (`businesses_user_id_key`), es decir, **un negocio por usuario**. Esa restricción es atómica frente a la concurrencia y es la que manda en la práctica: el límite de 5 nunca se alcanza. No se ha tocado (decisión de producto fuera de alcance). El trigger queda como defensa adicional por si se relaja en el futuro.
- **Prueba:** en la tabla real, un segundo negocio se rechaza por unicidad. En una tabla temporal con el mismo trigger, 5 inserciones se aceptan y la 6.ª se rechaza (`check_violation`), con el bloqueo consultivo retenido durante la transacción.

## 4. Registro y denegación de servicio

### Auditoría de A2.3

| Pregunta | Respuesta |
|---|---|
| ¿Se consumía antes de validar? | Se validaba el formato, pero el cupo global se gastaba **antes** de los límites por IP y email |
| ¿Contaba intentos o cuentas? | Intentos, incluidos duplicados y peticiones rechazadas |
| ¿Lo eluden las llamadas directas a Supabase Auth? | Sí. `supabase.auth.signUp` con la clave pública no pasa por la función; solo aplican los límites propios de Supabase Auth |
| ¿Permitía DoS? | Sí: 50 peticiones basura por hora bloqueaban todos los registros legítimos |

### Corrección

1. Validación de entrada, luego 10/h por IP y 5/h por email.
2. Tope global: `signup_created_recently(3600)` cuenta solo las cuentas creadas en la última hora por `signup-instant`. Se identifican por `app_metadata.signup_source`, que fija el servidor y el usuario no puede editar. Las peticiones fallidas, duplicadas o limitadas no consumen nada, y las altas directas por Supabase Auth no agotan el tope.
3. El comentario sobre la IP se corrigió: el límite por IP es orientativo y no se ha verificado que no sea falsificable.
4. Límite residual: para agotar el tope, un atacante tiene que **crear** 50 cuentas reales por hora, lo que exige rotar IPs y emails, deja rastro y se puede revertir. Las peticiones concurrentes pueden superarlo por como mucho el número de peticiones simultáneas (es un cortacircuitos, no una cuota exacta).

## 5. Coste máximo estimado

**Supuestos:**
- Modelo gpt-4o-mini a precio de lista: 0,15 $ por millón de tokens de entrada y 0,60 $ por millón de salida.
- Entrada máxima por llamada: unos 700 tokens en contenido semanal (prompt de ~575 caracteres más los datos del negocio, hasta 8 servicios) y unos 1.200 en mejoras (~921 caracteres más los datos y hasta 1.500 caracteres de texto fuente).
- Salida: 350 y 500 tokens como máximo.
- Precios, modelos y prompts sin cambios.

| | Contenido semanal | Mejoras |
|---|---|---|
| Coste por llamada | ≈ 0,000315 $ | ≈ 0,00048 $ |
| Llamadas por petición (con reintento) | ≤ 2 | ≤ 2 |
| Peticiones contabilizadas/mes (completed + consumed + expired) | ≤ 40 | ≤ 40 (y ≤ 80 entre ambas) |
| Peticiones totales/mes, **incluidas las liberadas** | ≤ 36 (6 intentos/semana × ≤ 6 semanas ISO, 1 negocio por usuario) | ≤ 40 (contador heredado de intentos, que nunca descuenta) |
| Llamadas al proveedor/mes, en el peor caso | ≤ 72 | ≤ 80 |
| **Coste por usuario y mes, en el peor caso** | ≈ 0,023 $ | ≈ 0,038 $ |

- **Por cuenta:** como máximo unos **0,06 $ al mes**. Un trial que abarque dos meses naturales llega a unos 0,12 $.
- **Reservadas, intentos y completadas.** Las liberadas (proveedor caído) no se contabilizan, pero sí cuentan en los intentos por semana o por borrador y en el contador heredado de mejoras. Eso es lo que acota los reintentos.
- **Estimación, no límite garantizado.** Las cifras dependen de los supuestos de tokens y precio. El servidor limita peticiones y llamadas, no dinero. El gasto agregado crece con el número de cuentas. Con autoconfirmación activa, cualquier cuenta nueva puede iniciar un trial. Por la vía de `signup-instant` (50 cuentas/h) el peor caso teórico ronda los 144 $/día, y las altas directas por Supabase Auth no tienen ese tope. **No existe un límite monetario garantizado.** Solo se lograría con un tope de gasto en la cuenta del proveedor de IA (control de consola, pendiente).
- Un timeout del cliente (20 s) se trata como «sin respuesta» y se libera, aunque el proveedor podría facturarlo. Ese coste queda acotado por los intentos de la tabla anterior.

## 6. Matriz de pruebas adicionales

`src/features/billing/__tests__/a231Reservations.test.ts` (23 pruebas), más la verificación revertida en base de datos (§2).

| # | Caso exigido | Prueba de código | Verificación en BD | Resultado |
|---|---|---|---|---|
| 1 | Doble liberación | `1. double release` | T1: release2=false, contador 0 | PASS |
| 2 | Liberar tras completar | `2. release after complete` | T2: false, contador 1 | PASS |
| 3 | Dos reservas concurrentes del mismo usuario | `3.` (FOR UPDATE antes de insertar; id único) y `3b.` (la segunda recibe `in_progress` y no llama a la IA) | reuse_id=invalid | PASS* |
| 4 | Liberación de otro mes | `4.` | T4: mes anterior 1→0, actual intacto | PASS |
| 5 | Reserva abandonada | `5.` | T5: expired, no liberable, cuenta | PASS |
| 6 | Error del proveedor | `6.` (released, 2 llamadas) y `6b.` (respuesta rechazada → consumed) | — | PASS |
| 7 | Error de persistencia tras generar | `7.` (ambos generadores → consumed) | — | PASS |
| 8 | Ambos generadores a la vez | `8.` y `8b.` (`monthly_limit` sin IA) | T8: fn_limit 40 / total 80 | PASS |
| 9 | 5.º y 6.º negocio concurrentes | `9.` (bloqueo antes de contar) | BZ: 6.º rechazado; único real | PASS* |
| 10 | Saturación maliciosa del registro | `10.` y validación previa | — | PASS |
| 11 | Registro directo por Supabase Auth | `11.` (solo cuentan las cuentas marcadas por el servidor) | — | PASS (la vía directa sigue abierta, ver riesgos) |
| 12 | Límites comerciales anteriores | `12.` (3/6/2, 40 heredado, 16 servicios, 40/80) | BI: bad_key / kind / closed / legacy40 | PASS |

\* La concurrencia real con dos sesiones no se pudo ejecutar: la herramienta SQL usa una sola sesión y `dblink` no está instalado (instalarlo queda fuera de alcance). La garantía se apoya en los bloqueos verificados (fila mensual `FOR UPDATE`, bloqueo consultivo retenido = 1) y en el orden de bloqueo comprobado.

**Pruebas existentes actualizadas** (comportamiento A2.3 invertido a propósito): `a23CostControl` T1, T2, T9, T10, T12, T18, T19, T21 y §6 de RPC; mocks de `weeklyContent` e `improvement` (`settleAiUsage`); `fix0721` (la última definición es ahora A2.3.1 y conserva las validaciones de fix0721). Además, se corrigieron dos conversiones de tipo de A2.3 que añadían 2 errores de TypeScript.

## 7. QA

| Comprobación | Resultado |
|---|---|
| Vitest | 25 ficheros, **544/544** |
| TypeScript (`tsconfig.app.json`) | 20 errores = línea base (A2.3 había dejado 22) |
| ESLint | 23 errores / 7 avisos = línea base |
| Build | OK |
| Asesores de seguridad | 8 = línea base. Las funciones nuevas no generan avisos |
| 14 funciones retiradas | 410 en vivo |
| `weekly-content`, `business-improvement`, `signup-instant` | Desplegadas; OPTIONS 200; sin sesión 401; entrada inválida 400 |

## 8. Ficheros modificados respecto a A2.3 y justificación

| Fichero | Justificación |
|---|---|
| `supabase/migrations/20261010165247_a231_ai_reservation_ledger_and_concurrency.sql` (nuevo) | Libro de reservas, reserve/settle/reconcile, restauración de `reserve_business_improvement` (fix0721) y `start_trial`, trigger serializado, eliminación de `release_ai_usage` |
| `supabase/migrations/20261010165844_a231_signup_created_accounts_breaker.sql` (nuevo) | Recuento de cuentas creadas para el tope global, solo para service_role |
| `supabase/functions/weekly-content/handler.ts`, `index.ts` | `settleAiUsage` por id con política released/consumed/completed; `monthly_limit` |
| `supabase/functions/business-improvement/handler.ts`, `index.ts` | Igual |
| `supabase/functions/signup-instant/index.ts` | Orden IP → email → tope de cuentas creadas; `email_confirm: true` restaurado; marca `signup_source`; comentario de IP corregido |
| `src/features/billing/repository.ts` | `startTrial` lee `reason` y usa el estado real |
| `src/features/weekly-content/{copy,model,repository}.ts` | Código y textos ES/EN de `monthly_limit` |
| `src/features/improvement/{copy,model,repository}.ts`, `ImprovementPanel.tsx` | Igual, más el estado «límite» del panel |
| Pruebas (`a231Reservations` nuevo, `a23CostControl`, `weeklyContent`, `improvement`, `fix0721`) | Ver §6 |

No se ha tocado: Stripe/facturación, Google OAuth/GBP, configuración de Auth/SMTP, las 14 funciones retiradas, `analyze-website` ni v0.7.1/v0.7.2/v0.7.3 (más allá de las rutas de IA pedidas). No se crearon cuentas reales ni hubo consumo de OpenAI.

## 9. Riesgos pendientes

1. **F-03 no resuelto:** la autoconfirmación sigue activa y no hay SMTP. La comprobación de correo en `start_trial` existe pero hoy no filtra nada, porque todas las cuentas quedan confirmadas. Activar la verificación real exige configurar SMTP y pasar `signup-instant` a `auth.signUp`, ya que la API de administración no envía el correo de confirmación.
2. **Altas directas por Supabase Auth:** eluden los límites de `signup-instant`. Mitigación en consola: desactivar las altas públicas si toda alta pasa por la función, ajustar los límites de Auth o añadir CAPTCHA (requiere autorización).
3. **Sin tope monetario garantizado:** configurar un límite de gasto en la cuenta del proveedor de IA.
4. **Protección de contraseñas filtradas desactivada** (asesor): se activa en consola.
5. **IP del cliente:** no se ha verificado que el proxy impida falsificar `x-forwarded-for`; el límite por IP es orientativo.
6. **Reservas abandonadas:** siguen contando tras caducar (conservador). Una caída del servidor antes de llamar a la IA cuesta una unidad. `reconcile_ai_usage()` no está programado (`pg_cron` no instalado); de momento solo se ejecuta en cada reserva para el propio usuario.
7. **Contador heredado de mejoras (40/mes):** cuenta los intentos liberados por caída del proveedor. Es el comportamiento comercial de fix0721 y se conservó por requisito.
8. **Concurrencia multisesión** no ejecutada en vivo (§6).
9. **Un negocio por usuario** (`UNIQUE(user_id)`): decidir si es intencionado antes de anunciar «hasta 5 negocios».
10. Asesores preexistentes: `get_funnel_stats` con search_path mutable, tablas con RLS sin políticas (intencionado) y funciones de facturación ejecutables por usuarios autenticados (intencionado).
