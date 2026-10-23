# A3.5.4.1.1 — Deterministic Social Signals: Real-Data Validation & Freeze

Modo: auditoría final / read-only. Fecha: 2026-10-22.
Motor auditado: `src/features/social-intelligence/` (versión `a3541-1`).

---

## 1. Executive verdict

**NO-GO — A3.5.4.1 FIX REQUIRED**

El motor se comporta correctamente con los datos reales en casi todas las dimensiones:

- frecuencia INSUFFICIENT en ambas plataformas;
- engagement de Facebook NOT_AVAILABLE, con NULL ≠ 0;
- ceros reales de Instagram conservados;
- 2 de 3 posts de Facebook sin texto, expresado solo como hecho;
- caption de Instagram presente;
- salida determinista;
- sin persistencia, IA, recomendaciones, Social Score ni tendencias;
- tests, TypeScript y build en verde.

Sin embargo, la sección 8 de la especificación pide auditar la frontera de recencia, y existe una **inconsistencia de frontera entre documentación, implementación, evidencia y tests** (hallazgo F-1, severidad MEDIUM). Afecta directamente al resultado real actual.

En concreto, la evidencia real muestra `daysSinceLastPost: 7` y `thresholdDays: 7` con `FB_RECENT_ACTIVITY = NOT_DETECTED`. El informe A3.5.4.1 define "Último contenido ≤ 7 días → RECENT = DETECTED". La decisión no es reconstruible a partir de la evidencia entera mostrada.

Conforme a la sección 8 ("Si existe inconsistencia: NO-GO"), no se concede la congelación. No se ha modificado ningún archivo del motor; se propone un hotfix separado (sección 21).

---

## 2. Production snapshot

Lectura exclusivamente mediante `SELECT`. Hora de base de datos en la captura: `2026-10-22T18:04:26.817Z`. No se lanzó ninguna sincronización.

### Conexión

| Campo | Valor |
|---|---|
| `meta_connections.status` | connected |
| `instagram_status` | connected |
| Página Facebook | Localseohub.io |
| Cuenta Instagram | @localseohub.io |

### Estado de sincronización (`meta_sync_state`)

| Plataforma | status | error_code | item_count | pages_fetched | last_success_at |
|---|---|---|---|---|---|
| facebook | ok | NULL | 3 | 1 | 2026-10-22T17:22:26.633Z |
| instagram | ok | NULL | 1 | 1 | 2026-10-22T17:22:26.696Z |

### Contenido (`meta_content_items`)

No se copia el texto; solo se registra si existe y su longitud.

| Plataforma | content_type | published_at | Texto | reaction_count | comment_count |
|---|---|---|---|---|---|
| facebook | photo | 2026-10-14T22:07:47Z | No | NULL | NULL |
| facebook | photo | 2026-10-14T22:12:35Z | No | NULL | NULL |
| facebook | photo | 2026-10-14T22:27:37Z | Sí (707 car.) | NULL | NULL |
| instagram | image | 2026-10-14T22:26:26Z | Sí (679 car.) | 0 | 0 |

Filas almacenadas por plataforma: Facebook 3 y Instagram 1, idénticas a `item_count`.

---

## 3. Data provenance

Cadena demostrada: **A3.5.3 Meta Read Layer → datos normalizados persistidos → entrada A3.5.4.1.**

**Único escritor posible.**
- Las tablas solo conceden `SELECT` a `authenticated`; las escrituras requieren `service_role`.
- El único código que inserta en `meta_content_items` es la función `meta_sync_apply` (migración `20261022170333_a353_meta_read_layer.sql`).
- `meta_sync_apply` solo tiene EXECUTE para `service_role` y la invoca exclusivamente `supabase/functions/meta-read/index.ts`.

**Sin seeds ni fixtures.**
- Ninguna migración inserta filas de contenido.
- Ningún archivo de `src` escribe en estas tablas: solo `metaRepository.ts` lee `meta_sync_state`.

**Firma temporal de una sola sincronización.**
- En Facebook, `fetched_at` de todas las filas = `last_success_at` = `updated_at` del sync state: 2026-10-22 17:22:26.63314 UTC.
- En Instagram lo mismo: 17:22:26.696147 UTC.
- Esto es coherente con una única transacción de `meta_sync_apply`.

**Contenido de origen Meta.** Los IDs tienen el formato Graph `pageId_postId` (Facebook) y el formato media ID (Instagram), y los permalinks son https.

**Cómo se pasó al motor.**
- El snapshot se transcribió literalmente: timestamps, tipos, NULL y ceros.
- Para no copiar contenido del negocio, el texto se sustituyó por una cadena de la misma longitud. El motor solo evalúa si existe texto no vacío.
- El motor se ejecutó desde una carpeta temporal, eliminada al terminar. No se añadieron fixtures a la base de datos.

---

## 4. Facebook real-data result

`evaluatedAt = 2026-10-22T18:04:26.817Z`.

| Señal | Estado | Motivo | Evidencia clave | ¿Esperado? |
|---|---|---|---|---|
| FB_FREQUENCY_OBSERVED | INSUFFICIENT | WINDOW_TOO_SHORT | 3 posts entre 22:07:47 y 22:27:37 Z; `observedSpanDays 0` | Sí |
| FB_ENGAGEMENT_DATA_AVAILABLE | NOT_AVAILABLE | METRICS_NULL | `reactionNullCount 3`, `commentNullCount 3`, `reactionTotal null`, `commentTotal null` | Sí (NULL ≠ 0) |
| FB_CONTENT_TEXT_MISSING | DETECTED (INFO) | — | `postsWithText 1`, `postsWithoutText 2`, `sampleSufficiency LIMITED` | Sí (solo hecho) |
| FB_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | `{photo: 3}` | Sí |
| FB_NO_CONTENT | NOT_DETECTED | — | `observedPostCount 3` | Sí |
| FB_RECENT_ACTIVITY | NOT_DETECTED | — | `daysSinceLastPost 7`, `thresholdDays 7` | **Inconsistente (F-1)** |
| FB_LONG_INACTIVITY | NOT_DETECTED | — | `daysSinceLastPost 7`, `thresholdDays 30` | Sí |
| FB_TREND | NOT_AVAILABLE | NO_HISTORY | — | Sí |

- La frecuencia no se infiere de una ráfaga de 20 minutos, y no se calcula `postsPer30Days`.
- La señal de texto ausente no lleva juicio de calidad, penalización ni recomendación.
- **Recencia exacta:** el último post es de 2026-10-14T22:27:37Z. Han pasado 7 d 19 h 36 m 49.8 s, por lo que `daysSinceLastPost = floor(7.817…) = 7`. Ver sección 8.

---

## 5. Instagram real-data result

| Señal | Estado | Motivo | Evidencia clave | ¿Esperado? |
|---|---|---|---|---|
| IG_FREQUENCY_OBSERVED | INSUFFICIENT | SAMPLE_TOO_SMALL | 1 contenido | Sí |
| IG_ENGAGEMENT_DATA_AVAILABLE | INSUFFICIENT | SAMPLE_TOO_SMALL | `reactionTotal 0`, `commentTotal 0`, `availableEngagementCount 1`, `missingEngagementCount 0` | Sí (ceros reales, no NULL ni NOT_AVAILABLE) |
| IG_CAPTION_MISSING | NOT_DETECTED | — | `postsWithText 1`, `postsWithoutText 0` | Sí |
| IG_CONTENT_TYPE_VARIETY | INSUFFICIENT | SAMPLE_TOO_SMALL | `{image: 1}` | Sí |
| IG_NO_CONTENT | NOT_DETECTED | — | `observedPostCount 1` | Sí |
| IG_RECENT_ACTIVITY | NOT_DETECTED | — | `daysSinceLastPost 7`, `thresholdDays 7` | **Inconsistente (F-1)** |
| IG_LONG_INACTIVITY | NOT_DETECTED | — | `daysSinceLastPost 7`, `thresholdDays 30` | Sí |
| IG_TREND | NOT_AVAILABLE | NO_HISTORY | — | Sí |

- **Recencia exacta:** el último contenido es de 2026-10-14T22:26:26Z. Han pasado 7 d 19 h 38 m, por lo que `daysSinceLastPost = 7`.

### Cross-platform

| Señal | Estado | Evidencia |
|---|---|---|
| FB_ONLY_RECENT_ACTIVITY | NOT_DETECTED | 7 / 7 días, umbral 7 |
| IG_ONLY_RECENT_ACTIVITY | NOT_DETECTED | 7 / 7 días, umbral 7 |
| PLATFORM_RECENCY_DIFFERENCE | NOT_DETECTED | diferencia 0, umbral 30 |

---

## 6. Freshness validation

- La frescura depende solo de `meta_sync_state.last_success_at`. `meta_connections.last_synced_at` no se usa: un test de código fuente lo verifica.
- Resultado real: ambas plataformas FRESH, con `hoursSinceSuccess 0` (unos 42 minutos).
- Implementación, con tiempo transcurrido exacto en ms:
  - FRESH: ≤ 24 h;
  - AGING: > 24 h y ≤ 168 h;
  - STALE: > 168 h.
- Hay tests de frontera exactos: 24 h = FRESH; 7 d = AGING; 7 d + 1 ms = STALE.
- En este caso documentación, implementación y tests coinciden. La evidencia incluye `lastSuccessAt` exacto, así que la decisión es reconstruible.
- Observación menor, no bloqueante: `hoursSinceSuccess` está redondeado hacia abajo. Por ejemplo, 24 h 30 m se muestra como 24 con AGING. Conviene alinearlo en el mismo hotfix.

---

## 7. Recency validation

- La recencia depende solo de `published_at`: el `newestObservedPostAt` real coincide con el post más reciente.
- `last_success_at` no se usa como fecha de publicación, y `published_at` no se usa como fecha de sincronización. Son variables separadas en `observePlatform` y en `freshnessOf`.
- Un post antiguo dentro de un snapshot FRESH se trata correctamente. Hay un test con un post de hace 45 días y una sincronización reciente, que da FRESH + LONG_INACTIVITY.
- Los datos STALE no se presentan como actuales: todas las señales no-trend pasan a STALE con `lastKnownStatus`, severidad null y motivo STALE_DATA (test 19).

**Separación correcta. El defecto está en la semántica de frontera de la recencia (sección 8).**

---

## 8. Boundary semantics

Respuesta a la pregunta de la sección 8 de la especificación: **B) existe una inconsistencia de frontera.**

| Fuente | Regla "reciente" | Regla "inactividad larga" |
|---|---|---|
| Informe A3.5.4.1 (§ recencia y `activityState`) | "Último contenido ≤ 7 días"; "8–30 días" = intermedio | "> 30 días" |
| Implementación (`signals.ts`, líneas 90–91, 113–114 y 272–274) | ms transcurridos ≤ 7 × 24 h | ms transcurridos > 30 × 24 h |
| Evidencia emitida | `daysSinceLastPost` = días completos (redondeo hacia abajo) | ídem |
| Cross-platform `PLATFORM_RECENCY_DIFFERENCE` | — | diferencia de días **enteros** ≥ 30 |

Pruebas de frontera ejecutadas con timestamps sintéticos, fuera de la base de datos:

| Tiempo desde el último post | daysSinceLastPost | RECENT | LONG | activityState |
|---|---|---|---|---|
| 7 d exactos | 7 | DETECTED | — | recent |
| 7 d + 1 ms | 7 | **NOT_DETECTED** | — | intermediate |
| 7 d 19 h (caso real) | 7 | **NOT_DETECTED** | — | intermediate |
| 7 d 23 h 59 m | 7 | **NOT_DETECTED** | — | intermediate |
| 8 d | 8 | NOT_DETECTED | — | intermediate |
| 30 d exactos | 30 | — | NOT_DETECTED | intermediate |
| 30 d + 1 ms | 30 | — | **DETECTED** | old |
| 30 d 23 h 59 m | 30 | — | **DETECTED** | old |
| 31 d | 31 | — | DETECTED | old |

Hay tres manifestaciones:

1. **Recencia.** Durante casi 24 horas, la evidencia muestra `7 ≤ 7` y la señal dice NOT_DETECTED.
2. **Inactividad larga.** Durante casi 24 horas, la evidencia muestra `30`, que no es `> 30`, y la señal dice DETECTED (MEDIUM).
3. **Unidades mezcladas.** `FB_ONLY_RECENT_ACTIVITY` e `IG_ONLY_RECENT_ACTIVITY` usan ms exactos, mientras que `PLATFORM_RECENCY_DIFFERENCE` usa días enteros redondeados. Ejemplo: 38 d frente a 8 d 23 h da una diferencia entera de 30 (DETECTED), cuando la diferencia real es de 29,04 días.

Tests: el test de datos reales ("7 days since last post: neither recent nor long inactivity") fija el comportamiento inconsistente. No existe ningún test de frontera de recencia a 7 d / 7 d + ε / 8 d ni a 30 d / 30 d + ε / 31 d. Los tests de frontera solo cubren la frescura.

---

## 9. Sufficiency validation

La suficiencia se evalúa **por dimensión**, con el snapshot real:

| Dimensión | Facebook | Instagram |
|---|---|---|
| recency | SUFFICIENT | SUFFICIENT |
| frequency | INSUFFICIENT | INSUFFICIENT |
| content_completeness | LIMITED | INSUFFICIENT |
| content_type | INSUFFICIENT | INSUFFICIENT |
| engagement_availability | INSUFFICIENT (y señal NOT_AVAILABLE por NULL) | INSUFFICIENT (con ceros reales) |

No existe un estado global que colapse estas distinciones. Cada señal lleva su propia `sampleSufficiency` y su propio motivo.

---

## 10. Evidence traceability

Para cada una de las 19 señales reales se comprobó que la evidencia responde a "¿por qué?":

- **Frecuencia:** `postsWithTimestamp`, `oldest/newestObservedPostAt`, `observedSpanDays`, `sampleSufficiency`, `windowTruncated`. Reconstruible.
- **Texto/caption:** `observedPostCount`, `postsWithText`, `postsWithoutText`, `sampleSufficiency`. Reconstruible.
- **Engagement:** recuentos observados y NULL por métrica, totales con `null` cuando no hay datos, y `available/missingEngagementCount`. Reconstruible.
- **Tipos:** `contentTypes`, `distinctContentTypes`. Reconstruible.
- **Recencia y cross-platform: no reconstruible** desde los campos de decisión que se muestran (`daysSinceLastPost` frente a `thresholdDays`). Solo podría reconstruirse recalculando desde `newestObservedPostAt` y `evaluatedAt` con una regla en milisegundos que no está documentada. Este es el impacto de F-1.
- Todas las señales incluyen `lastSuccessAt`, `syncStatus` y `errorCode`. Ninguna incluye texto de posts ni `external_id`.

---

## 11. Unsupported-output audit

Se escaneó la salida real completa (JSON de 9.072 bytes) buscando: score, recommend/recomend, deber/should, benchmark, follower, reach, impression, conversion, venta/sales, competit, quality/calidad, predic/forecast, growth.

- **0 coincidencias.**
- Las únicas apariciones de "TREND" son las claves `FB_TREND` e `IG_TREND`, ambas NOT_AVAILABLE con NO_HISTORY.
- Hay una sola severidad no nula: INFO, en `FB_CONTENT_TEXT_MISSING`.
- Esto es coherente con los tests de regex prohibidos de la suite.

---

## 12. Error semantics

Validado mediante los tests existentes, sin provocar errores en producción. El bloque "technical states never become business signals" y los tests 23, "never synced / disconnected / missing row", y "stale platform makes cross-platform stale" comprueban que:

- `rate_limited`, `permission_unavailable`, `reauth_required` y los errores genéricos (`api_error`, `malformed`) se convierten en `blockedReason` (RATE_LIMITED, PERMISSION_UNAVAILABLE, REAUTH_REQUIRED, SYNC_ERROR);
- la plataforma bloqueada se evalúa **sin ítems previos**, y todas sus señales son NOT_AVAILABLE con evidencia mínima `{lastSuccessAt, syncStatus, errorCode}`;
- nunca aparecen LONG_INACTIVITY, NO_CONTENT ni actividad "old" a partir de datos antiguos;
- un error en una plataforma no contamina a la otra, y el cross-platform queda NOT_AVAILABLE.

Correcto.

---

## 13. Determinism

- Dos ejecuciones en el mismo proceso con el mismo `evaluatedAt` dan `JSON.stringify` idénticos.
- Dos procesos independientes dan el mismo hash MD5 de salida: `33224b49c0bb2dfdfd5eac4432704b7f`.
- El código fuente no contiene `Date.now()`, `new Date()` sin argumento, `Math.random`, fetch, IA ni Supabase (test de auditoría de fuente).
- Los ítems se ordenan por `external_id` y las listas de señales tienen un orden fijo.

---

## 14. Persistence audit

- No hay migraciones nuevas: la última migración, tanto en la base de datos como en local, es `20261022170523_a353_meta_sync_claim_min_interval.sql`.
- No hay tablas de señales. El motor no importa ningún cliente de base de datos.
- Las filas de Meta conservan sus valores y timestamps de la captura, sin escrituras posteriores a 17:22:26 UTC.
- La salida se calcula en memoria a partir del snapshot.

---

## 15. Frozen boundaries

Los timestamps de archivo no sirven como prueba porque el espacio de trabajo se restauró a las 18:03:39 UTC. La verificación se hizo por contenido:

- `supabase/functions-deploy-state.json`: `meta-connection`, `meta-oauth-start`, `meta-oauth-callback` y `meta-read` tienen `hasChanged: false`. No hay ninguna función con cambios pendientes, así que el código local es idéntico al desplegado.
- No se ha desplegado nada en A3.5.4.1 ni en A3.5.4.1.1.
- **RLS del Read Layer:** cada tabla Meta tiene una única política `SELECT TO authenticated USING (auth.uid() = user_id)`. Los grants son `SELECT` para `authenticated` y escritura solo para `service_role`. Sin cambios.
- OAuth, scopes, Vault, ciclo de vida de tokens, peticiones Graph y `appsecret_proof` viven en esas funciones y migraciones, que no se han modificado.
- El motor solo importa tipos de `meta-connection/metaStatus` (`import type`) y no ejecuta código congelado.
- Las suites de A3.5.1, A3.5.1.2, A3.5.2.1 y A3.5.3 siguen pasando dentro de la regresión completa.

---

## 16. Integration boundaries

- Ningún archivo de `src` fuera de `features/social-intelligence/` importa el motor.
- No está conectado a Hoy, Plan, Advisor, Twin, Resumen ni al Action Layer.
- No existe una pantalla "Social Intelligence" ni rutas nuevas.
- Esto es intencionado.

---

## 17. Specific tests

`src/features/social-intelligence/__tests__/a3541SocialSignals.test.ts`: **53 / 53 pasan.** Coincide con la referencia.

Cobertura que falta (F-1): fronteras de recencia y de inactividad larga, y un invariante evidencia-decisión.

---

## 18. Full regression suite

**59 archivos / 2.104 tests pasan.** Coincide con la referencia y no hay cambios.

---

## 19. TypeScript result

`tsc --noEmit -p tsconfig.app.json`: **20 errores en 8 archivos**, idénticos a la referencia:

| Archivo | Errores |
|---|---|
| src/components/LandingPage.tsx | 10 |
| src/components/BusinessAuditLanding.tsx | 2 |
| src/components/ContentGeneratorLanding.tsx | 2 |
| src/components/MetaAdsLanding.tsx | 2 |
| src/App.tsx | 1 |
| src/components/DiagnosticLanding.tsx | 1 |
| src/legacy/components/AdminDashboard.tsx | 1 |
| src/features/reality-engine/__tests__/a3422GbpRecovery.test.ts | 1 |

Errores atribuibles a `social-intelligence`: **0**.

---

## 20. Production build

`npm run build`: **OK.** Se ejecutó después de borrar la carpeta temporal de validación.

---

## 21. Findings

### F-1 — Inconsistencia de frontera en la recencia (MEDIUM, bloquea la congelación)

| Campo | Detalle |
|---|---|
| Severidad | MEDIUM. No hay riesgo de seguridad ni de datos inventados. Rompe la trazabilidad, contradice el contrato documentado y afecta al resultado real actual. |
| Archivo | `src/features/social-intelligence/signals.ts`: `activityStateOf` (90–91), `platformSignals` (113–114), `crossPlatformSignals` (272–276). Informe A3.5.4.1, secciones de recencia, `activityState` y cross-platform. |
| Causa | La decisión compara milisegundos exactos frente a 7 × 24 h y 30 × 24 h. La evidencia publica días enteros redondeados hacia abajo. La documentación habla en días enteros ("≤ 7 días", "8–30 días"). La diferencia cross-platform usa días enteros, mientras FB_ONLY e IG_ONLY usan ms. |
| Impacto | Hoy, con datos reales: evidencia `7` / umbral `7` y estado NOT_DETECTED. Durante el día 30, LONG_INACTIVITY (MEDIUM) se activaría con evidencia `30` / umbral `30`. A3.5.4.2 convertirá estas señales en hallazgos, así que la incoherencia llegaría al usuario como un texto contradictorio ("hace 7 días" frente a "sin actividad reciente"). |
| Tests que deberían cubrirlo | 7 d exactos, 7 d 23 h 59 m y 8 d para RECENT; 30 d, 30 d 23 h 59 m y 31 d para LONG; diferencia cross-platform en el borde (29 d 23 h frente a 30 d); invariante "para toda señal de recencia, el estado es reproducible comparando `daysSinceLastPost` con `thresholdDays`". |

**Hotfix mínimo propuesto (A3.5.4.1.2), pendiente de autorización.**

**Opción A (recomendada): días enteros como única unidad de decisión.** Es la que se alinea con el contrato documentado y con la evidencia.

1. `recent = daysSinceLastPost ≤ 7`; `long = daysSinceLastPost > 30`, es decir, ≥ 31 días completos.
2. Aplicar la misma regla en `activityStateOf` y en FB_ONLY e IG_ONLY. `PLATFORM_RECENCY_DIFFERENCE` ya usa días enteros y no cambia.
3. Sustituir la aserción del test real por la nueva semántica y añadir los tests de frontera y el invariante descritos arriba.
4. Actualizar las tablas del informe A3.5.4.1. Opcionalmente, alinear `hoursSinceSuccess` (observación de la sección 6).

Efecto sobre los datos reales: con días enteros, `FB_RECENT_ACTIVITY` e `IG_RECENT_ACTIVITY` serían DETECTED (INFO) mientras `daysSinceLastPost` siga siendo 7. Eso dura hasta 2026-10-22T22:26:26Z en Instagram y 22:27:37Z en Facebook. A partir de ahí, 8 días, NOT_DETECTED e `intermediate`.

**Opción B: mantener la regla en milisegundos.** Habría que:

- añadir `hoursSinceLastPost` exacto a la evidencia;
- reexpresar los umbrales como 168 h y 720 h;
- hacer que la diferencia cross-platform use la misma unidad;
- reescribir la documentación ("≤ 168 h", "> 720 h").

Es más precisa, pero menos legible para hallazgos en lenguaje natural.

No se ha modificado código.

### Observaciones no bloqueantes

- O-1: `hoursSinceSuccess` está redondeado hacia abajo (ver sección 6). La decisión es reconstruible porque se incluye `lastSuccessAt`.
- O-2: siguen vigentes las limitaciones de A3.5.4.1: sin histórico; sin distinción de la causa del NULL de engagement en Facebook; sin `media_count` de Instagram; sin función de lectura de `meta_content_items` en el navegador (prevista para A3.5.4.3).

---

## 22. Freeze decision

| Criterio | Resultado |
|---|---|
| Snapshot real | Sí |
| Provenance demostrada | Sí |
| Facebook correcto | Sí, salvo la frontera de recencia (F-1) |
| Instagram correcto | Sí, salvo la frontera de recencia (F-1) |
| NULL ≠ 0 | Sí |
| Frequency INSUFFICIENT | Sí (ambas) |
| Freshness y recency separadas | Sí |
| **Fronteras temporales coherentes** | **No (F-1)** |
| **Evidencia trazable** | **No para recencia (F-1)** |
| Errores técnicos sin diagnóstico | Sí |
| Determinismo | Sí |
| Sin persistencia, IA, recomendaciones, score ni tendencias | Sí |
| Fases congeladas intactas | Sí |
| Tests | 53 / 2.104, todos pasan |
| TypeScript sin errores nuevos | Sí (20 legacy, 0 nuevos) |
| Build | OK |

**NO-GO — A3.5.4.1 FIX REQUIRED**

---

## 23. Exact frozen scope

**Nada se congela en esta fase.**

Siguen congeladas, sin cambios: A3.5.1, A3.5.1.2, A3.5.2 / A3.5.2.1 / A3.5.2.2 y A3.5.3 / A3.5.3.1.

El motor A3.5.4.1 (`types.ts`, `policy.ts`, `signals.ts`, `engine.ts` y su test) queda **sin congelar** hasta que se aplique y valide el hotfix.

---

## 24. Exact next step

1. Elegir la opción A (recomendada) o la B de la sección 21 y autorizar **A3.5.4.1.2 — Recency Boundary Hotfix**.
   - Alcance: solo `signals.ts`, los tests de frontera, el test real y la documentación de A3.5.4.1.
   - Sin base de datos, sin despliegues y sin cambios en fases congeladas.
2. Repetir esta validación con datos reales (A3.5.4.1.1 bis) sobre el mismo snapshot.
3. Solo con GO — FREEZE A3.5.4.1, diseñar e implementar por separado **A3.5.4.2 — Social Findings & Recommendations Engine**.

No se ha implementado A3.5.4.2.

NO-GO — A3.5.4.1 FIX REQUIRED
